import { Injectable, Inject, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { IPassportRepository, PASSPORT_REPOSITORY } from '../../domain/ports/passport.repository.port';
import { IUserRepository, USER_REPOSITORY } from '../../domain/ports/user.repository.port';
import { UpdatePassportDto, CreateConsentDto, CertificateInput } from '../dtos/passport.dto';
import { Consent } from '../../domain/consent.entity';
import { Passport, PassportProps, Certificate } from '../../domain/passport.entity';
import { MediaUseCase } from './media.use-case';
import { DomainException, ErrorCode, CryptoService } from '@shared';
import {
  ProfileAudience,
  ProfileContact,
  buildProfileView,
  invalidPrivacyEntries,
  resolveFieldPrivacy,
} from '../../domain/profile-visibility';

const CONSENT_TTL_MS = 10 * 60 * 1000;

/**
 * Chứng chỉ sinh viên tự khai luôn là SELF_DECLARED; chỉ Admin mới chuyển sang VERIFIED.
 * Kiểm tra thêm issuedDate không nằm ở tương lai ngay tại tầng UseCase.
 */
const toSelfDeclaredCertificate = (input: CertificateInput): Certificate => {
  const issuedDate = new Date(input.issuedDate);
  if (Number.isNaN(issuedDate.getTime()) || issuedDate.getTime() > Date.now()) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      'Ngày cấp chứng chỉ (issuedDate) không hợp lệ hoặc nằm ở tương lai',
      400,
    );
  }
  return Object.freeze({
    type: input.type,
    name: input.name,
    score: input.score,
    issuedDate,
    expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
    assetId: input.assetId,
    status: 'SELF_DECLARED' as const,
  });
};

const toCertificateResponse = (cert: Certificate) => ({
  ...cert,
  issuedDate: new Date(cert.issuedDate).toISOString(),
  expiryDate: cert.expiryDate ? new Date(cert.expiryDate).toISOString() : undefined,
});

@Injectable()
export class PassportUseCase {
  constructor(
    @Inject(PASSPORT_REPOSITORY) private readonly passportRepo: IPassportRepository,
    private readonly mediaUseCase: MediaUseCase,
    private readonly cryptoService: CryptoService,
    @Optional()
    @Inject(USER_REPOSITORY)
    private readonly userRepo?: IUserRepository,
  ) {}

  async getMyPassport(studentId: string) {
    await this.assertAccountActive(studentId, false);
    const passport = await this.passportRepo.findByStudentId(studentId);
    if (!passport) {
      throw DomainException.notFound('Passport');
    }
    return this.toResponse(passport, await this.loadContact(studentId));
  }

  /**
   * FR-PROF-05: sets who may see each field. Only visibility changes, so the profile version
   * (and any open application preview) stays as it is.
   */
  async updateFieldPrivacy(studentId: string, update: Record<string, unknown>) {
    await this.assertAccountActive(studentId, false);
    const invalid = invalidPrivacyEntries(update ?? {});
    if (invalid.length > 0) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        'Quyền hiển thị không hợp lệ: chỉ nhận PRIVATE, TEAMMATES hoặc PUBLIC cho các trường được hỗ trợ',
        400,
        invalid,
      );
    }
    const passport = await this.passportRepo.findByStudentId(studentId);
    if (!passport) {
      throw DomainException.notFound('Passport');
    }
    const merged = { ...resolveFieldPrivacy(passport.props.fieldPrivacy), ...(update as Record<string, string>) };
    const updated = passport.withFieldPrivacy(merged);
    await this.passportRepo.update(updated, passport.version);
    return this.toResponse(updated, await this.loadContact(studentId));
  }

  /**
   * FR-PROF-05: the Passport of [studentId] as [audience] may see it. Callers decide the audience:
   * PUBLIC for anyone signed in, TEAMMATES only after Collaboration has checked the shared team.
   */
  async getProfileView(studentId: string, audience: ProfileAudience) {
    if (audience !== 'PUBLIC' && audience !== 'TEAMMATES') {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, 'audience phải là PUBLIC hoặc TEAMMATES', 400);
    }
    const user = this.userRepo ? await this.userRepo.findById(studentId) : null;
    if (user && (user.status === 'DELETED' || user.status === 'BLOCKED')) {
      throw DomainException.notFound('Hồ sơ');
    }
    const passport = await this.passportRepo.findByStudentId(studentId);
    if (!passport) {
      throw DomainException.notFound('Hồ sơ');
    }
    const view = buildProfileView(passport, { email: user?.email, phone: user?.phone }, audience);
    // The CV link only goes to audiences the `cv` visibility already lets see the file.
    return Object.freeze({ ...view, ...(await this.fileLinks(passport, Boolean(view.cvAssetId))) });
  }

  /** Avatar (always visible) and, when [withCv], the CV with short-lived links. */
  private async fileLinks(passport: Passport, withCv: boolean) {
    const [avatar, cv] = await Promise.all([
      this.mediaUseCase.fileLink(passport.props.avatarAssetId),
      withCv ? this.mediaUseCase.fileLink(passport.props.cvAssetId) : undefined,
    ]);
    return { avatarUrl: avatar?.viewUrl ?? '', ...(cv ? { cvFile: cv } : {}) };
  }

  /**
   * FR-PROF-01 & BR15:
   * - Kiểm tra Optimistic Concurrency qua `expectedVersion` (nếu lệch -> 409 VERSION_MISMATCH).
   * - Nếu có gửi kèm các trường `avatarAssetId`, `cvAssetId`, `pitchVideoAssetId` hoặc `certificates[].assetId`,
   *   kiểm tra bắt buộc mọi asset đó phải thuộc về `studentId` (không nhận asset người khác -> 403 FORBIDDEN_RESOURCE)
   *   và đang ở trạng thái `READY` (asset chưa sẵn sàng -> 409 ASSET_NOT_AVAILABLE).
   */
  async updateMyPassport(studentId: string, dto: UpdatePassportDto) {
    await this.assertAccountActive(studentId, false);
    const currentPassport = await this.passportRepo.findByStudentId(studentId);
    if (!currentPassport) {
      throw DomainException.notFound('Passport');
    }

    if (dto.expectedVersion !== undefined && currentPassport.version !== dto.expectedVersion) {
      throw DomainException.conflict(
        ErrorCode.VERSION_MISMATCH,
        `Phiên bản Passport không khớp (hiện tại: v${currentPassport.version}, yêu cầu: v${dto.expectedVersion}). Vui lòng tải lại dữ liệu mới nhất`,
      );
    }

    const { certificates, expectedVersion: _ignoredExpectedVersion, phone, ...rest } = dto;
    const changes: Partial<PassportProps> = certificates
      ? { ...rest, certificates: certificates.map(toSelfDeclaredCertificate) }
      : rest;

    // Kiểm tra các assetId vừa được truyền lên trong bản cập nhật
    const newlySubmittedAssetIds = this.extractNewlySubmittedAssetIds(dto);
    if (newlySubmittedAssetIds.length > 0) {
      await this.mediaUseCase.verifyAssetsUsableByStudent(studentId, newlySubmittedAssetIds);
    }

    // Immutable update: Tạo bản sao Passport mới với version tăng lên 1
    const updatedPassport = currentPassport.updateProfile(changes);
    await this.passportRepo.update(updatedPassport, currentPassport.version);

    // FR-PROF-05: the phone lives on the account, next to the email.
    if (phone !== undefined && this.userRepo) {
      const user = await this.userRepo.findById(studentId);
      if (user) await this.userRepo.update(user.withPhone(phone));
    }

    return this.toResponse(updatedPassport, await this.loadContact(studentId));
  }

  async createConsent(studentId: string, dto: CreateConsentDto) {
    await this.assertAccountActive(studentId, true);
    const passport = await this.passportRepo.findByStudentId(studentId);
    if (!passport) {
      throw DomainException.notFound('Passport');
    }

    if (passport.version !== dto.profileVersion) {
      throw DomainException.conflict(
        ErrorCode.SNAPSHOT_STALE,
        'Hồ sơ Passport đã thay đổi, vui lòng tạo Preview mới trước khi xác nhận Consent',
      );
    }

    const consentId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + CONSENT_TTL_MS);

    const consent = new Consent(consentId, {
      actorId: studentId,
      purpose: 'APPLICATION_SUBMISSION',
      opportunityId: dto.opportunityId,
      submissionId: dto.submissionId,
      previewId: dto.previewId,
      snapshotId: dto.snapshotId,
      profileVersion: dto.profileVersion,
      ruleVersion: dto.ruleVersion,
      manifestHash: dto.manifestHash,
      payloadHash: dto.payloadHash,
      scope: dto.scope ?? ['SNAPSHOT', 'ATTACHMENTS'],
      expiresAt,
    });

    await this.passportRepo.saveConsent(consent);

    return Object.freeze({
      consentId: consent.id,
      previewId: consent.previewId,
      snapshotId: consent.snapshotId,
      payloadHash: consent.payloadHash,
      scope: consent.scope,
      expiresAt: expiresAt.toISOString(),
    });
  }

  /**
   * Mục 26 SRS & BR15: Cung cấp Snapshot bất biến của Passport qua gRPC cho Opportunity Service khi tạo Preview.
   * Nếu có đính kèm `attachmentIds`, xác minh toàn bộ `attachmentIds` đều thuộc về `studentId` và ở trạng thái `READY`.
   */
  async getProfileSnapshot(studentId: string, attachmentIds: readonly string[] = []) {
    await this.assertAccountActive(studentId, true);
    const passport = await this.passportRepo.findByStudentId(studentId);
    if (!passport) {
      throw DomainException.notFound('Passport');
    }

    if (attachmentIds.length > 0) {
      await this.mediaUseCase.verifyAssetsUsableByStudent(studentId, attachmentIds);
    }

    const snapshotData = {
      studentId: passport.studentId,
      fullName: passport.props.fullName,
      bio: passport.props.bio ?? '',
      regionCode: passport.props.regionCode ?? '',
      education: passport.props.education ?? null,
      skills: passport.props.skills ?? [],
      achievements: passport.props.achievements ?? [],
      certificates: passport.props.certificates ?? [],
      cvAssetId: passport.props.cvAssetId ?? null,
      completionScore: passport.completionScore,
      profileVersion: passport.version,
    };

    const sortedAttachments = [...attachmentIds].sort().map((assetId) => ({
      assetId,
      assetVersion: 1,
      status: 'READY',
    }));

    const manifestHash = this.cryptoService.generatePayloadHash({
      attachments: sortedAttachments,
    });

    return Object.freeze({
      snapshotId: `snap_${crypto.randomUUID()}`,
      profileVersion: passport.version,
      completionScore: passport.completionScore,
      snapshotJson: JSON.stringify(snapshotData),
      manifestJson: JSON.stringify(sortedAttachments),
      manifestHash,
      missingFields: passport.getMissingFields(),
    });
  }

  /**
   * Mục 26 SRS: Xác thực Consent, phạm vi scope và hậu kiểm trạng thái tệp READY qua gRPC
   * ngay trước khi Opportunity Service commit Application
   */
  async validateConsent(params: {
    studentId: string;
    consentId: string;
    previewId: string;
    snapshotId: string;
    opportunityId: string;
    expectedRuleVersion: number;
    expectedPayloadHash: string;
    attachmentIds?: readonly string[];
    requiredScope?: readonly string[];
  }) {
    await this.assertAccountActive(params.studentId, true);
    const [passport, consent] = await Promise.all([
      this.passportRepo.findByStudentId(params.studentId),
      this.passportRepo.findConsentById(params.consentId),
    ]);

    if (!passport) {
      throw DomainException.notFound('Passport');
    }
    if (!consent) {
      throw DomainException.notFound('Consent');
    }

    consent.verifyForSubmission({
      studentId: params.studentId,
      previewId: params.previewId,
      snapshotId: params.snapshotId,
      opportunityId: params.opportunityId,
      currentProfileVersion: passport.version,
      expectedRuleVersion: params.expectedRuleVersion,
      expectedPayloadHash: params.expectedPayloadHash,
      requiredScope: params.requiredScope,
    });

    // Hậu kiểm toàn bộ tệp đính kèm trong Preview và tệp ast_* trong Passport vẫn ở trạng thái READY
    const assetIdsToReverify = new Set<string>(params.attachmentIds ?? []);
    if (passport.props.cvAssetId?.startsWith('ast_')) {
      assetIdsToReverify.add(passport.props.cvAssetId);
    }
    if (passport.props.pitchVideoAssetId?.startsWith('ast_')) {
      assetIdsToReverify.add(passport.props.pitchVideoAssetId);
    }
    for (const cert of passport.props.certificates ?? []) {
      if (cert.assetId?.startsWith('ast_')) {
        assetIdsToReverify.add(cert.assetId);
      }
    }

    if (assetIdsToReverify.size > 0) {
      await this.mediaUseCase.verifyAssetsUsableByStudent(
        params.studentId,
        Array.from(assetIdsToReverify),
      );
    }

    return Object.freeze({
      valid: true,
      profileVersion: passport.version,
    });
  }

  /**
   * F40 Backend — FR-AUTH-02, FR-AUTH-08, E13, NFR11:
   * Kiểm tra trạng thái tài khoản tại biên ứng tuyển/hồ sơ:
   * - Nếu tài khoản đã bị xóa (DELETED) hoặc khóa (BLOCKED) -> thu hồi quyền truy cập ngay lập tức (401 UNAUTHENTICATED).
   * - Nếu tài khoản chưa xác minh OTP (PENDING_VERIFICATION) -> chặn không cho tạo Preview, ký Consent hoặc nộp hồ sơ (403 FORBIDDEN_RESOURCE).
   */
  private async assertAccountActive(
    studentId: string,
    requireVerifiedForApply: boolean,
  ): Promise<void> {
    if (!this.userRepo) return;
    const user = await this.userRepo.findById(studentId);
    if (!user) return;

    if (user.status === 'DELETED' || user.status === 'BLOCKED') {
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Tài khoản đã bị xóa hoặc khóa, phiên làm việc đã bị thu hồi',
        401,
      );
    }

    if (requireVerifiedForApply && user.status === 'PENDING_VERIFICATION') {
      throw DomainException.forbidden(
        'Tài khoản chưa xác minh OTP không được tạo Preview, ký Consent hoặc nộp hồ sơ ứng tuyển',
      );
    }
  }

  /**
   * Mọi assetId client gửi lên đều phải có bản ghi trong `media_assets`, READY và đúng chủ sở hữu.
   */
  private extractNewlySubmittedAssetIds(dto: UpdatePassportDto): string[] {
    const candidates: string[] = [];
    if (dto.avatarAssetId?.trim()) candidates.push(dto.avatarAssetId.trim());
    if (dto.cvAssetId?.trim()) candidates.push(dto.cvAssetId.trim());
    if (dto.pitchVideoAssetId?.trim()) candidates.push(dto.pitchVideoAssetId.trim());
    for (const cert of dto.certificates ?? []) {
      if (cert.assetId?.trim()) {
        candidates.push(cert.assetId.trim());
      }
    }
    return candidates;
  }

  private async loadContact(studentId: string): Promise<ProfileContact> {
    const user = this.userRepo ? await this.userRepo.findById(studentId) : null;
    return { email: user?.email, phone: user?.phone };
  }

  /** Owner's own view: every field, the resolved visibility settings and the contact details. */
  private async toResponse(passport: Passport, contact: ProfileContact = {}) {
    return Object.freeze({
      ...passport.props,
      ...(await this.fileLinks(passport, true)),
      fieldPrivacy: resolveFieldPrivacy(passport.props.fieldPrivacy),
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      id: passport.id,
      certificates: (passport.props.certificates ?? []).map(toCertificateResponse),
      scoreBreakdown: passport.scoreBreakdown,
      profileVersion: passport.version,
      version: passport.version,
    });
  }
}
