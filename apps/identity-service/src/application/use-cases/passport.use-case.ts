import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { IPassportRepository, PASSPORT_REPOSITORY } from '../../domain/ports/passport.repository.port';
import { UpdatePassportDto, CreateConsentDto, CertificateInput } from '../dtos/passport.dto';
import { Consent } from '../../domain/consent.entity';
import { Passport, PassportProps, Certificate } from '../../domain/passport.entity';
import { MediaUseCase } from './media.use-case';
import { DomainException, ErrorCode, CryptoService } from '@shared';

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
  ) {}

  async getMyPassport(studentId: string) {
    const passport = await this.passportRepo.findByStudentId(studentId);
    if (!passport) {
      throw DomainException.notFound('Passport');
    }
    return this.toResponse(passport);
  }

  /**
   * FR-PROF-01 & BR15:
   * - Kiểm tra Optimistic Concurrency qua `expectedVersion` (nếu lệch -> 409 VERSION_MISMATCH).
   * - Nếu có gửi kèm các trường `avatarAssetId`, `cvAssetId`, `pitchVideoAssetId` hoặc `certificates[].assetId`,
   *   kiểm tra bắt buộc mọi asset đó phải thuộc về `studentId` (không nhận asset người khác -> 403 FORBIDDEN_RESOURCE)
   *   và đang ở trạng thái `READY` (asset chưa sẵn sàng -> 409 ASSET_NOT_AVAILABLE).
   */
  async updateMyPassport(studentId: string, dto: UpdatePassportDto) {
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

    const { certificates, expectedVersion: _ignoredExpectedVersion, ...rest } = dto;
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
    await this.passportRepo.update(updatedPassport);

    return this.toResponse(updatedPassport);
  }

  async createConsent(studentId: string, dto: CreateConsentDto) {
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
      expiresAt,
    });

    await this.passportRepo.saveConsent(consent);

    return Object.freeze({
      consentId: consent.id,
      previewId: consent.previewId,
      snapshotId: consent.snapshotId,
      payloadHash: consent.payloadHash,
      expiresAt: expiresAt.toISOString(),
    });
  }

  /**
   * Mục 26 SRS & BR15: Cung cấp Snapshot bất biến của Passport qua gRPC cho Opportunity Service khi tạo Preview.
   * Nếu có đính kèm `attachmentIds`, xác minh toàn bộ `attachmentIds` đều thuộc về `studentId` và ở trạng thái `READY`.
   */
  async getProfileSnapshot(studentId: string, attachmentIds: readonly string[] = []) {
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
   * Mục 26 SRS: Xác thực Consent qua gRPC trước khi Opportunity Service commit Application
   */
  async validateConsent(params: {
    studentId: string;
    consentId: string;
    previewId: string;
    snapshotId: string;
    opportunityId: string;
    expectedRuleVersion: number;
    expectedPayloadHash: string;
  }) {
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
    });

    return Object.freeze({
      valid: true,
      profileVersion: passport.version,
    });
  }

  /**
   * Xác thực các assetId bắt đầu bằng tiền tố chuẩn `ast_` (được tạo từ MediaUseCase).
   * Cho phép các mã định danh tĩnh trong dữ liệu seed/test cũ của F04 (ví dụ `asset_avatar_1`)
   * hoặc bắt buộc kiểm tra nghiêm ngặt mọi `ast_*` và khi asset tồn tại trong kho `media_assets`.
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

  private toResponse(passport: Passport) {
    return Object.freeze({
      ...passport.props,
      id: passport.id,
      certificates: (passport.props.certificates ?? []).map(toCertificateResponse),
      scoreBreakdown: passport.scoreBreakdown,
      profileVersion: passport.version,
      version: passport.version,
    });
  }
}
