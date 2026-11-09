import { Injectable, Inject, Optional, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import {
  IApplicationRepository,
  APPLICATION_REPOSITORY,
  ApplicationRevisionRecord,
  SubmissionPreviewRecord,
  SubmissionIntentRecord,
  TeamMemberSnapshotRecord,
  TeamMemberConsentRefRecord,
} from '../../domain/ports/application.repository.port';
import {
  IOpportunityRepository,
  OPPORTUNITY_REPOSITORY,
} from '../../domain/ports/opportunity.repository.port';
import { Application, ScreeningStatus } from '../../domain/application.entity';
import { Opportunity, ScreeningReason } from '../../domain/opportunity.entity';
import {
  CreatePreviewDto,
  CreateSubmissionIntentDto,
  SubmitApplicationDto,
  ApplySnapshotRetentionDto,
  EvaluateTestResultLogDto,
} from '../dtos/opportunity.dto';
import { DomainException, ErrorCode, CryptoService, AuthenticatedUser } from '@shared';

export const IDENTITY_GRPC_CLIENT = Symbol('IDENTITY_GRPC_CLIENT');
export const COLLABORATION_GRPC_CLIENT = Symbol('COLLABORATION_GRPC_CLIENT');

export interface IdentityGrpcClientService {
  getProfileSnapshot(data: {
    studentId: string;
    attachmentIds: string[];
  }): Observable<{
    snapshotId: string;
    profileVersion: number;
    completionScore: number;
    snapshotJson: string;
    manifestJson: string;
    manifestHash: string;
    missingFields?: string[];
  }>;
  validateConsent(data: {
    studentId: string;
    consentId: string;
    previewId: string;
    snapshotId: string;
    opportunityId: string;
    expectedRuleVersion: number;
    expectedPayloadHash: string;
    attachmentIds?: string[];
    requiredScope?: string[];
  }): Observable<{
    valid: boolean;
    profileVersion: number;
  }>;
}

export interface CollaborationGrpcClientService {
  validateReservation(data: {
    team_id: string;
    fencing_token: number;
    roster_version?: number;
  }): Observable<{
    is_valid: boolean;
    status: string;
    error_code: string;
  }>;
  confirmSubmission(data: {
    team_id: string;
    reservation_id: string;
    fencing_token: number;
  }): Observable<{
    success: boolean;
    status: string;
    message: string;
  }>;
}

const PREVIEW_TTL_MS = 10 * 60 * 1000;

const parseJsonObject = (rawJson: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(rawJson);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const extractAttachmentIdsFromManifest = (manifestJson: string): string[] => {
  try {
    const parsed = JSON.parse(manifestJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) =>
        item && typeof item === 'object' && 'assetId' in item
          ? String((item as { assetId: unknown }).assetId)
          : '',
      )
      .filter((id) => id.length > 0);
  } catch {
    return [];
  }
};

@Injectable()
export class ApplicationUseCase implements OnModuleInit {
  private identityGrpc?: IdentityGrpcClientService;
  private collaborationGrpc?: CollaborationGrpcClientService;

  constructor(
    @Inject(APPLICATION_REPOSITORY)
    private readonly applicationRepo: IApplicationRepository,
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly opportunityRepo: IOpportunityRepository,
    private readonly cryptoService: CryptoService,
    @Optional()
    @Inject(IDENTITY_GRPC_CLIENT)
    private readonly identityClient?: ClientGrpc,
    @Optional()
    @Inject(COLLABORATION_GRPC_CLIENT)
    private readonly collaborationClient?: ClientGrpc,
  ) {}

  onModuleInit() {
    if (this.identityClient) {
      this.identityGrpc =
        this.identityClient.getService<IdentityGrpcClientService>('IdentityGrpcService');
    }
    if (this.collaborationClient) {
      this.collaborationGrpc =
        this.collaborationClient.getService<CollaborationGrpcClientService>(
          'CollaborationGrpcService',
        );
    }
  }

  /**
   * FR-PROF-03 & FR-PROF-08: Đánh giá độ sẵn sàng của Hồ sơ Passport theo từng Cơ hội cụ thể
   */
  async checkReadiness(studentId: string, opportunityId: string) {
    const opportunity = await this.opportunityRepo.findById(opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }

    const profileData = await this.fetchProfileSnapshot(studentId, []);
    const snapshotObj = parseJsonObject(profileData.snapshotJson);
    const evaluation = opportunity.evaluateScreening(
      snapshotObj,
      profileData.missingFields ?? [],
    );

    return Object.freeze({
      opportunityId: opportunity.id,
      studentId,
      profileVersion: profileData.profileVersion,
      ruleVersion: opportunity.ruleVersion,
      completionScore: profileData.completionScore,
      readinessScore: evaluation.readinessScore,
      isReady: evaluation.isReady,
      screening: evaluation.screening,
      missingFields: evaluation.missingFields,
      screeningReasons: evaluation.screeningReasons,
    });
  }

  /**
   * Mục 6 WF04, FR-APP-01/02 & Mục 26 SRS: Tạo bản Preview bất biến (TTL 10 phút) trước khi xin Consent
   */
  async createPreview(studentId: string, dto: CreatePreviewDto) {
    const opportunity = await this.opportunityRepo.findById(dto.opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }

    if (opportunity.applyMode !== 'IN_APP') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Cơ hội EXTERNAL không tiếp nhận hồ sơ trực tiếp trên Scholink',
      );
    }

    if (!opportunity.isRegistrationOpen()) {
      throw DomainException.conflict(ErrorCode.DEADLINE_PASSED, 'Đã hết hạn đăng ký nộp hồ sơ');
    }

    if (opportunity.ruleVersion !== dto.expectedRuleVersion) {
      throw DomainException.conflict(
        ErrorCode.VERSION_MISMATCH,
        'Điều kiện của cơ hội đã được cập nhật, vui lòng tải lại trước khi tạo Preview',
      );
    }

    const profileData = await this.fetchProfileSnapshot(studentId, dto.attachmentIds);
    const snapshotObj = parseJsonObject(profileData.snapshotJson);
    const evaluation = opportunity.evaluateScreening(
      snapshotObj,
      profileData.missingFields ?? [],
    );

    if (!evaluation.isReady) {
      throw DomainException.unprocessable(
        ErrorCode.PROFILE_INCOMPLETE,
        'Hồ sơ Passport còn thiếu trường bắt buộc đối với cơ hội này',
        evaluation.missingFields,
      );
    }

    // Mục 26 SRS: PayloadHash là SHA-256 JSON chuẩn hóa RFC 8785 của snapshot, ruleVersion và manifest tệp
    const payloadHash = this.cryptoService.generatePayloadHash({
      snapshot: snapshotObj,
      ruleVersion: opportunity.ruleVersion,
      manifest: JSON.parse(profileData.manifestJson),
    });

    const preview: SubmissionPreviewRecord = Object.freeze({
      previewId: `prv_${crypto.randomUUID()}`,
      actorId: studentId,
      opportunityId: opportunity.id,
      submissionId: dto.submissionId,
      snapshotId: profileData.snapshotId,
      profileVersion: profileData.profileVersion,
      ruleVersion: opportunity.ruleVersion,
      snapshotJson: profileData.snapshotJson,
      manifestJson: profileData.manifestJson,
      manifestHash: profileData.manifestHash,
      payloadHash,
      screening: evaluation.screening,
      screeningReasons: evaluation.screeningReasons,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
    });

    await this.applicationRepo.savePreview(preview);

    return Object.freeze({
      ...preview,
      expiresAt: preview.expiresAt.toISOString(),
    });
  }

  async getPreview(studentId: string, previewId: string) {
    const preview = await this.applicationRepo.findPreviewById(previewId);
    if (!preview || preview.actorId !== studentId) {
      throw DomainException.notFound('Bản xem trước (Preview)');
    }
    if (new Date() > preview.expiresAt) {
      throw DomainException.gone(ErrorCode.PREVIEW_EXPIRED, 'Bản xem trước (Preview) đã hết hạn');
    }
    return Object.freeze({
      ...preview,
      expiresAt: preview.expiresAt.toISOString(),
    });
  }

  /**
   * F31 Backend — Mục 7 WF07, FR-APP-05 & Mục 27, 28 SRS:
   * Tạo Submission Intent ở trạng thái PENDING khi Trưởng đội bắt đầu phiên nộp hồ sơ đội.
   */
  async createSubmissionIntent(leaderId: string, dto: CreateSubmissionIntentDto) {
    const opportunity = await this.opportunityRepo.findById(dto.opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }

    this.ensureTeamCompetitionOpen(opportunity);

    if (dto.memberIds && dto.memberIds.length > 0) {
      this.validateTeamRosterBounds(opportunity, leaderId, dto.memberIds);
      await this.ensureNoActiveMemberConflict(dto.opportunityId, dto.memberIds);
    }

    if (this.applicationRepo.findByOpportunityAndTeam) {
      const existingTeamApp = await this.applicationRepo.findByOpportunityAndTeam(
        dto.opportunityId,
        dto.teamId,
      );
      if (existingTeamApp && !existingTeamApp.canResubmit()) {
        throw DomainException.conflict(
          ErrorCode.ALREADY_APPLIED,
          'Đội thi của bạn đã có hồ sơ đang còn hiệu lực cho cuộc thi này',
        );
      }
    }

    const intentToSave: SubmissionIntentRecord = Object.freeze({
      submissionId: dto.submissionId,
      opportunityId: dto.opportunityId,
      teamId: dto.teamId,
      leaderId,
      status: 'PENDING',
      reservationId: dto.reservationId,
      fencingToken: dto.fencingToken,
      rosterVersion: dto.rosterVersion,
      memberIds: Object.freeze([...(dto.memberIds ?? [leaderId])]),
    });

    const saved = this.applicationRepo.createOrGetSubmissionIntent
      ? await this.applicationRepo.createOrGetSubmissionIntent(intentToSave)
      : intentToSave;

    return Object.freeze({
      ...saved,
      aborted: saved.status === 'ABORTED',
    });
  }

  /**
   * F31 Backend & SCHOL-20 — Mục 7 WF07 & Mục 26, 28 SRS:
   * Hủy nguyên tử Submission Intent (PENDING -> ABORTED).
   * Nếu Intent hoặc hồ sơ đội đã COMMITTED thì không ghi đè, trả về status = COMMITTED, aborted = false và outcome = 'COMMITTED'.
   */
  async abortSubmissionIntent(params: {
    submissionId?: string;
    actorId?: string;
    opportunityId?: string;
    teamId?: string;
    reservationId?: string;
    fencingToken?: number;
    reason?: string;
  }) {
    // Worker nội bộ và Admin không có actorId; sinh viên chỉ được hủy phiên do chính mình làm trưởng đội
    if (params.actorId) {
      const intent = params.submissionId
        ? await this.applicationRepo.findSubmissionIntentById?.(params.submissionId)
        : null;
      if (!intent || intent.leaderId !== params.actorId) {
        throw DomainException.forbidden('Chỉ trưởng đội của phiên nộp mới được hủy phiên này');
      }
    }

    const resolvedSubmissionId = params.submissionId || params.reservationId || '';
    const resolvedTeamId = params.teamId || '';
    const resolvedReservationId = params.reservationId || params.submissionId || '';
    const resolvedFencingToken = params.fencingToken ?? 0;

    // 1. Khi gọi theo kiểu Worker Reconciliation (teamId + reservationId), kiểm tra hồ sơ đội đã nộp chưa
    if (!params.submissionId && resolvedTeamId && this.applicationRepo.findApplicationByTeamId) {
      const existingApp = await this.applicationRepo.findApplicationByTeamId(resolvedTeamId);
      if (existingApp && existingApp.status === 'SUBMITTED') {
        return Object.freeze({
          submissionId: resolvedSubmissionId,
          opportunityId: existingApp.opportunityId,
          teamId: resolvedTeamId,
          leaderId: existingApp.studentId,
          status: 'COMMITTED' as const,
          applicationId: existingApp.id,
          reservationId: resolvedReservationId,
          fencingToken: resolvedFencingToken,
          rosterVersion: existingApp.props.rosterVersion ?? 1,
          memberIds: existingApp.memberIds ?? [],
          aborted: false,
          reason: params.reason ?? '',
          outcome: 'COMMITTED' as const,
          message: 'Hồ sơ đội đã được nộp thành công trước đó (COMMITTED)',
        });
      }
    }

    // 2. Nếu repository hỗ trợ khóa nguyên tử abortSubmissionIntent (F31 & MongooseApplicationRepository)
    if (this.applicationRepo.abortSubmissionIntent && resolvedSubmissionId) {
      const result = await this.applicationRepo.abortSubmissionIntent({
        submissionId: resolvedSubmissionId,
        opportunityId: params.opportunityId,
        teamId: resolvedTeamId,
        leaderId: params.actorId,
        reason: params.reason,
      });

      const outcome: 'ABORTED' | 'COMMITTED' =
        result.status === 'COMMITTED' ? 'COMMITTED' : 'ABORTED';

      return Object.freeze({
        submissionId: result.submissionId,
        opportunityId: result.opportunityId,
        teamId: result.teamId,
        leaderId: result.leaderId,
        status: result.status,
        applicationId: result.applicationId ?? '',
        reservationId: result.reservationId ?? resolvedReservationId,
        fencingToken: result.fencingToken ?? resolvedFencingToken,
        rosterVersion: result.rosterVersion ?? 1,
        memberIds: result.memberIds ?? [],
        aborted: result.aborted,
        reason: result.reason ?? '',
        outcome,
        message:
          outcome === 'COMMITTED'
            ? 'Intent đã được ghi nhận COMMITTED'
            : `Intent đã bị hủy thành công (${params.reason || 'Timeout Worker'})`,
      });
    }

    // 3. Fallback cho các InMemoryRepository chỉ triển khai findSubmissionIntent + upsertSubmissionIntent (SCHOL-14 / SCHOL-20)
    if (this.applicationRepo.findSubmissionIntent && this.applicationRepo.upsertSubmissionIntent) {
      const intent = await this.applicationRepo.findSubmissionIntent(
        resolvedTeamId,
        resolvedSubmissionId,
      );
      if (intent?.status === 'COMMITTED') {
        return Object.freeze({
          submissionId: resolvedSubmissionId,
          opportunityId: params.opportunityId ?? '',
          teamId: resolvedTeamId,
          leaderId: params.actorId ?? '',
          status: 'COMMITTED' as const,
          applicationId: '',
          reservationId: resolvedReservationId,
          fencingToken: resolvedFencingToken,
          rosterVersion: 1,
          memberIds: [] as readonly string[],
          aborted: false,
          reason: params.reason ?? '',
          outcome: 'COMMITTED' as const,
          message: 'Intent đã được ghi nhận COMMITTED',
        });
      }

      await this.applicationRepo.upsertSubmissionIntent({
        submissionId: resolvedSubmissionId,
        opportunityId: params.opportunityId ?? '',
        teamId: resolvedTeamId,
        leaderId: params.actorId ?? '',
        status: 'ABORTED',
      });

      return Object.freeze({
        submissionId: resolvedSubmissionId,
        opportunityId: params.opportunityId ?? '',
        teamId: resolvedTeamId,
        leaderId: params.actorId ?? '',
        status: 'ABORTED' as const,
        applicationId: '',
        reservationId: resolvedReservationId,
        fencingToken: resolvedFencingToken,
        rosterVersion: 1,
        memberIds: [] as readonly string[],
        aborted: true,
        reason: params.reason ?? '',
        outcome: 'ABORTED' as const,
        message: `Intent đã bị hủy thành công (${params.reason || 'Timeout Worker'})`,
      });
    }

    throw DomainException.conflict(
      ErrorCode.INTERNAL_ERROR,
      'Repository chưa hỗ trợ abortSubmissionIntent',
    );
  }

  async getSubmissionById(submissionId: string) {
    if (!this.applicationRepo.findSubmissionIntentById) {
      throw DomainException.notFound('Submission Intent');
    }
    const intent = await this.applicationRepo.findSubmissionIntentById(submissionId);
    if (!intent) {
      throw DomainException.notFound('Submission Intent');
    }
    return Object.freeze({
      ...intent,
      applicationId: intent.applicationId ?? '',
      reservationId: intent.reservationId ?? '',
      fencingToken: intent.fencingToken ?? 0,
      rosterVersion: intent.rosterVersion ?? 1,
      memberIds: intent.memberIds ?? [],
      aborted: intent.status === 'ABORTED',
      reason: intent.reason ?? '',
    });
  }

  /**
   * Mục 6 WF04, Mục 7 WF07, FR-APP-01/02/03/05/07 & Mục 26, 27, 28 SRS:
   * Commit Application (INDIVIDUAL hoặc TEAM) từ đúng bản Preview bất biến đã xem,
   * xác thực Consent + Scope + Asset READY, kiểm tra Business Uniqueness và ghi Outbox trong cùng 1 transaction.
   */
  async submit(studentId: string, dto: SubmitApplicationDto) {
    const opportunity = await this.opportunityRepo.findById(dto.opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }

    if (opportunity.applyMode !== 'IN_APP') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Cơ hội EXTERNAL không tiếp nhận hồ sơ trực tiếp trên Scholink',
      );
    }

    if (!opportunity.isRegistrationOpen()) {
      throw DomainException.conflict(ErrorCode.DEADLINE_PASSED, 'Đã hết hạn đăng ký nộp hồ sơ');
    }

    if (opportunity.ruleVersion !== dto.expectedRuleVersion) {
      throw DomainException.conflict(
        ErrorCode.VERSION_MISMATCH,
        'Điều kiện của cơ hội đã thay đổi trước khi nộp',
      );
    }

    // SCHOL-20: Team submission intent check to resolve concurrent commit/abort race
    if (
      dto.submissionType === 'TEAM' &&
      dto.teamId &&
      dto.submissionId &&
      this.applicationRepo.findSubmissionIntent
    ) {
      const intent = await this.applicationRepo.findSubmissionIntent(dto.teamId, dto.submissionId);
      if (intent?.status === 'ABORTED') {
        throw DomainException.conflict(
          ErrorCode.HOLD_EXPIRED,
          'Phiên nộp hồ sơ đội đã bị hủy do quá hạn thời gian giữ chỗ (Lease Expired)',
        );
      }
    }

    if (dto.submissionType === 'TEAM') {
      return this.submitTeamApplication(studentId, opportunity, dto);
    }

    if (opportunity.type === 'COMPETITION' && opportunity.props.competitionMode === 'TEAM') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Cuộc thi này yêu cầu nộp hồ sơ theo đội (TEAM)',
      );
    }

    if (
      !dto.previewId ||
      !dto.snapshotId ||
      dto.profileVersion === undefined ||
      !dto.payloadHash ||
      !dto.consentId
    ) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        'Thiếu thông tin previewId, snapshotId, profileVersion, payloadHash hoặc consentId',
        400,
      );
    }

    const preview = await this.applicationRepo.findPreviewById(dto.previewId);
    if (!preview) {
      throw DomainException.notFound('Bản xem trước (Preview)');
    }

    this.verifyPreviewMatch(
      preview,
      studentId,
      {
        opportunityId: dto.opportunityId,
        snapshotId: dto.snapshotId,
        profileVersion: dto.profileVersion,
        payloadHash: dto.payloadHash,
      },
      opportunity.ruleVersion,
    );

    const attachmentIds = extractAttachmentIdsFromManifest(preview.manifestJson);
    const requiredScope =
      attachmentIds.length > 0 ? ['SNAPSHOT', 'ATTACHMENTS'] : ['SNAPSHOT'];

    if (this.identityGrpc) {
      await firstValueFrom(
        this.identityGrpc.validateConsent({
          studentId,
          consentId: dto.consentId,
          previewId: dto.previewId,
          snapshotId: dto.snapshotId,
          opportunityId: dto.opportunityId,
          expectedRuleVersion: opportunity.ruleVersion,
          expectedPayloadHash: preview.payloadHash,
          attachmentIds,
          requiredScope,
        }),
      );
    }

    // Đánh giá lại Screening trên chính Snapshot bất biến trong Preview (không dùng dữ liệu live)
    const snapshotObj = parseJsonObject(preview.snapshotJson);
    const evaluation = opportunity.evaluateScreening(snapshotObj);
    if (!evaluation.isReady) {
      throw DomainException.unprocessable(
        ErrorCode.PROFILE_INCOMPLETE,
        'Bản chụp hồ sơ không đủ các trường bắt buộc của cơ hội',
        evaluation.missingFields,
      );
    }

    const existing = await this.applicationRepo.findByOpportunityAndStudent(
      dto.opportunityId,
      studentId,
    );

    if (existing && !existing.canResubmit()) {
      throw DomainException.conflict(
        ErrorCode.ALREADY_APPLIED,
        'Bạn đã nộp hồ sơ cho cơ hội này rồi',
      );
    }

    const initialStatus =
      evaluation.screening === 'INELIGIBLE' ? 'INELIGIBLE' : 'SUBMITTED';

    const application = existing
      ? existing.resubmit({
          previewId: preview.previewId,
          snapshotId: preview.snapshotId,
          profileVersion: preview.profileVersion,
          ruleVersion: opportunity.ruleVersion,
          payloadHash: preview.payloadHash,
          consentId: dto.consentId,
          submissionId: dto.submissionId,
          screening: evaluation.screening,
          screeningReasons: evaluation.screeningReasons,
        })
      : new Application(`app_${crypto.randomUUID()}`, {
          opportunityId: dto.opportunityId,
          studentId,
          submissionId: dto.submissionId,
          submissionType: 'INDIVIDUAL',
          status: initialStatus,
          screening: evaluation.screening,
          screeningReasons: evaluation.screeningReasons,
          previewId: preview.previewId,
          snapshotId: preview.snapshotId,
          profileVersion: preview.profileVersion,
          ruleVersion: opportunity.ruleVersion,
          payloadHash: preview.payloadHash,
          consentId: dto.consentId,
          submittedAt: new Date(),
          revision: 1,
        });

    const revisionRecord = Object.freeze({
      id: `rev_${crypto.randomUUID()}`,
      applicationId: application.id,
      revision: application.revision,
      previewId: application.props.previewId,
      snapshotId: application.props.snapshotId,
      profileVersion: application.props.profileVersion,
      ruleVersion: application.props.ruleVersion ?? 1,
      snapshotJson: preview.snapshotJson,
      manifestJson: preview.manifestJson,
      payloadHash: application.props.payloadHash,
      consentId: application.props.consentId,
      screening: application.screening,
      screeningReasons: application.screeningReasons,
      submittedAt: application.props.submittedAt,
    });

    const eventRecord = Object.freeze({
      id: `evt_${crypto.randomUUID()}`,
      applicationId: application.id,
      actorId: studentId,
      fromStatus: existing?.status,
      toStatus: application.status,
      revision: application.revision,
      reason: existing ? 'STUDENT_RESUBMITTED' : 'INITIAL_SUBMISSION',
    });

    const outboxRecord = Object.freeze({
      eventId: `out_${crypto.randomUUID()}`,
      type: existing ? 'application.resubmitted' : 'application.submitted',
      occurredAt: new Date(),
      producer: 'opportunity-service',
      aggregateId: application.id,
      aggregateVersion: application.version,
      correlationId: dto.submissionId || preview.submissionId || application.id,
      data: {
        applicationId: application.id,
        opportunityId: application.opportunityId,
        studentId,
        submissionType: 'INDIVIDUAL',
        revision: application.revision,
        status: application.status,
        screening: application.screening,
      },
    });

    if (this.applicationRepo.commitSubmissionWithOutbox) {
      await this.applicationRepo.commitSubmissionWithOutbox({
        application,
        isResubmission: Boolean(existing),
        revision: revisionRecord,
        event: eventRecord,
        outbox: outboxRecord,
      });
    } else {
      if (existing) {
        await this.applicationRepo.update(application);
      } else {
        await this.applicationRepo.save(application);
      }
      await this.applicationRepo.saveRevision(revisionRecord);
      await this.applicationRepo.appendEvent(eventRecord);
    }

    return Object.freeze({
      applicationId: application.id,
      revision: application.revision,
      status: application.status,
      screening: application.screening,
      screeningReasons: application.screeningReasons,
      submittedAt: application.props.submittedAt.toISOString(),
      ruleVersion: application.props.ruleVersion ?? 1,
      profileVersion: application.props.profileVersion,
      previewId: application.props.previewId,
      snapshotId: application.props.snapshotId,
      payloadHash: application.props.payloadHash,
      consentId: application.props.consentId,
      submissionType: 'INDIVIDUAL' as const,
      teamId: undefined as string | undefined,
      submissionId: dto.submissionId,
      rosterVersion: undefined as number | undefined,
      consentRefs: Object.freeze([] as readonly TeamMemberConsentRefRecord[]),
    });
  }

  /**
   * F31 Backend — FR-APP-05, FR-PROF-08, WF07, Mục 12C, Mục 26, Mục 27, Mục 28 SRS:
   * Nộp hồ sơ theo Đội (TEAM):
   * - Kiểm tra hạn, ruleVersion, kích thước đội (minTeamSize..maxTeamSize), reservation/fencingToken
   * - Kiểm tra Preview + Consent + Screening trên Snapshot riêng của TỪNG thành viên trong đội
   * - Khóa nguyên tử submission_intents (PENDING -> COMMITTED) không thắng cùng Abort
   * - Đảm bảo application_members unique (isActive = true) không cho phép 2 đội dùng chung thành viên còn hiệu lực
   */
  private async submitTeamApplication(
    leaderId: string,
    opportunity: Opportunity,
    dto: SubmitApplicationDto,
  ) {
    this.ensureTeamCompetitionOpen(opportunity);

    if (!dto.teamId || !dto.submissionId || !dto.memberConsents || dto.memberConsents.length === 0) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        'Nộp hồ sơ theo đội bắt buộc phải có teamId, submissionId và danh sách memberConsents',
        400,
      );
    }

    const memberIds = dto.memberConsents.map((m) => m.studentId);
    this.validateTeamRosterBounds(opportunity, leaderId, memberIds);

    // FR-APP-05: luôn kiểm Reservation, FencingToken và Roster với CollaborationService
    if (this.collaborationGrpc) {
      const reservationCheck = await firstValueFrom(
        this.collaborationGrpc.validateReservation({
          team_id: dto.teamId,
          fencing_token: dto.fencingToken ?? 0,
          roster_version: dto.rosterVersion,
        }),
      );
      if (!reservationCheck.is_valid) {
        if (
          reservationCheck.error_code === 'FENCING_TOKEN_MISMATCH' ||
          reservationCheck.error_code === 'ROSTER_VERSION_MISMATCH'
        ) {
          throw DomainException.conflict(
            ErrorCode.VERSION_MISMATCH,
            'Fencing token hoặc danh sách đội của phiên giữ chỗ không còn hợp lệ',
          );
        }
        throw DomainException.conflict(
          ErrorCode.HOLD_EXPIRED,
          'Phiên giữ chỗ nộp hồ sơ đội (Reservation Lease) đã hết hạn hoặc không tồn tại',
        );
      }
    }

    // Kiểm tra trạng thái Submission Intent trước khi thực hiện xác thực nặng
    if (this.applicationRepo.findSubmissionIntentById) {
      const existingIntent = await this.applicationRepo.findSubmissionIntentById(dto.submissionId);
      if (existingIntent) {
        if (existingIntent.status === 'ABORTED') {
          throw DomainException.conflict(
            ErrorCode.HOLD_EXPIRED,
            'Phiên nộp hồ sơ đội (Submission Intent) đã bị hủy hoặc quá hạn lease (ABORTED)',
          );
        }
        if (existingIntent.status === 'COMMITTED') {
          throw DomainException.conflict(
            ErrorCode.ALREADY_APPLIED,
            'Phiên nộp hồ sơ đội (Submission Intent) này đã được commit trước đó',
          );
        }
        if (
          existingIntent.opportunityId !== dto.opportunityId ||
          existingIntent.teamId !== dto.teamId
        ) {
          throw DomainException.conflict(
            ErrorCode.STATE_CONFLICT,
            'Submission Intent không khớp với cuộc thi hoặc đội thi',
          );
        }
      }
    }

    const existingTeamApp = this.applicationRepo.findByOpportunityAndTeam
      ? await this.applicationRepo.findByOpportunityAndTeam(dto.opportunityId, dto.teamId)
      : null;

    if (existingTeamApp && !existingTeamApp.canResubmit()) {
      throw DomainException.conflict(
        ErrorCode.ALREADY_APPLIED,
        'Đội thi của bạn đã nộp hồ sơ cho cuộc thi này rồi',
      );
    }

    // Kiểm tra hai đội không dùng chung thành viên còn hiệu lực (application_members unique)
    await this.ensureNoActiveMemberConflict(
      dto.opportunityId,
      memberIds,
      existingTeamApp?.id,
    );

    const memberSnapshots: TeamMemberSnapshotRecord[] = [];
    const consentRefs: TeamMemberConsentRefRecord[] = [];
    const teamMissingFields: string[] = [];
    const aggregatedReasons: ScreeningReason[] = [];
    let teamScreening: ScreeningStatus = 'ELIGIBLE';

    for (const memberConsent of dto.memberConsents) {
      const memberPreview = await this.applicationRepo.findPreviewById(memberConsent.previewId);
      if (!memberPreview) {
        throw DomainException.notFound(
          `Bản xem trước (Preview) của thành viên ${memberConsent.studentId}`,
        );
      }

      this.verifyPreviewMatch(
        memberPreview,
        memberConsent.studentId,
        {
          opportunityId: dto.opportunityId,
          snapshotId: memberConsent.snapshotId,
          profileVersion: memberConsent.profileVersion,
          payloadHash: memberConsent.payloadHash,
        },
        opportunity.ruleVersion,
      );

      const attachmentIds = extractAttachmentIdsFromManifest(memberPreview.manifestJson);
      const requiredScope =
        attachmentIds.length > 0 ? ['SNAPSHOT', 'ATTACHMENTS'] : ['SNAPSHOT'];

      if (this.identityGrpc) {
        await firstValueFrom(
          this.identityGrpc.validateConsent({
            studentId: memberConsent.studentId,
            consentId: memberConsent.consentId,
            previewId: memberConsent.previewId,
            snapshotId: memberConsent.snapshotId,
            opportunityId: dto.opportunityId,
            expectedRuleVersion: opportunity.ruleVersion,
            expectedPayloadHash: memberPreview.payloadHash,
            attachmentIds,
            requiredScope,
          }),
        );
      }

      const memberSnapshotObj = parseJsonObject(memberPreview.snapshotJson);
      const memberEval = opportunity.evaluateScreening(memberSnapshotObj);

      if (!memberEval.isReady) {
        for (const missingField of memberEval.missingFields) {
          teamMissingFields.push(`member:${memberConsent.studentId}:${missingField}`);
        }
      }

      if (memberEval.screening === 'INELIGIBLE') {
        teamScreening = 'INELIGIBLE';
      } else if (memberEval.screening === 'NEEDS_REVIEW' && teamScreening === 'ELIGIBLE') {
        teamScreening = 'NEEDS_REVIEW';
      }

      for (const reason of memberEval.screeningReasons) {
        aggregatedReasons.push(
          Object.freeze({
            ruleFieldKey: reason.ruleFieldKey,
            reasonCode: reason.reasonCode,
            message: `[${memberConsent.studentId}] ${reason.message}`,
          }),
        );
      }

      memberSnapshots.push(
        Object.freeze({
          studentId: memberConsent.studentId,
          previewId: memberPreview.previewId,
          snapshotId: memberPreview.snapshotId,
          profileVersion: memberPreview.profileVersion,
          snapshotJson: memberPreview.snapshotJson,
          manifestJson: memberPreview.manifestJson,
          payloadHash: memberPreview.payloadHash,
          consentId: memberConsent.consentId,
          screening: memberEval.screening,
          screeningReasons: memberEval.screeningReasons,
        }),
      );

      consentRefs.push(
        Object.freeze({
          studentId: memberConsent.studentId,
          previewId: memberPreview.previewId,
          snapshotId: memberPreview.snapshotId,
          profileVersion: memberPreview.profileVersion,
          payloadHash: memberPreview.payloadHash,
          consentId: memberConsent.consentId,
        }),
      );
    }

    if (teamMissingFields.length > 0) {
      throw DomainException.unprocessable(
        ErrorCode.PROFILE_INCOMPLETE,
        'Hồ sơ của thành viên trong đội còn thiếu trường bắt buộc',
        teamMissingFields,
      );
    }

    const leaderSnapshot =
      memberSnapshots.find((ms) => ms.studentId === leaderId) ?? memberSnapshots[0];

    const teamPayloadHash = this.cryptoService.generatePayloadHash({
      opportunityId: opportunity.id,
      teamId: dto.teamId,
      ruleVersion: opportunity.ruleVersion,
      rosterVersion: dto.rosterVersion ?? 1,
      members: consentRefs.map((c) => ({
        studentId: c.studentId,
        snapshotId: c.snapshotId,
        profileVersion: c.profileVersion,
        payloadHash: c.payloadHash,
        consentId: c.consentId,
      })),
    });

    const teamSnapshotJson = JSON.stringify({
      teamId: dto.teamId,
      leaderId,
      rosterVersion: dto.rosterVersion ?? 1,
      members: memberSnapshots.map((ms) => ({
        studentId: ms.studentId,
        snapshotId: ms.snapshotId,
        profileVersion: ms.profileVersion,
        snapshot: parseJsonObject(ms.snapshotJson),
      })),
    });

    const teamManifestJson = JSON.stringify(
      memberSnapshots.map((ms) => ({
        studentId: ms.studentId,
        manifest: JSON.parse(ms.manifestJson),
      })),
    );

    const initialStatus = teamScreening === 'INELIGIBLE' ? 'INELIGIBLE' : 'SUBMITTED';

    const application = existingTeamApp
      ? existingTeamApp.resubmit({
          previewId: leaderSnapshot.previewId,
          snapshotId: leaderSnapshot.snapshotId,
          profileVersion: leaderSnapshot.profileVersion,
          ruleVersion: opportunity.ruleVersion,
          payloadHash: teamPayloadHash,
          consentId: leaderSnapshot.consentId,
          submissionId: dto.submissionId,
          rosterVersion: dto.rosterVersion ?? 1,
          reservationId: dto.reservationId,
          fencingToken: dto.fencingToken,
          memberIds,
          screening: teamScreening,
          screeningReasons: aggregatedReasons,
        })
      : new Application(`app_${crypto.randomUUID()}`, {
          opportunityId: dto.opportunityId,
          studentId: leaderId,
          teamId: dto.teamId,
          submissionId: dto.submissionId,
          rosterVersion: dto.rosterVersion ?? 1,
          reservationId: dto.reservationId,
          fencingToken: dto.fencingToken,
          memberIds,
          submissionType: 'TEAM',
          status: initialStatus,
          screening: teamScreening,
          screeningReasons: aggregatedReasons,
          previewId: leaderSnapshot.previewId,
          snapshotId: leaderSnapshot.snapshotId,
          profileVersion: leaderSnapshot.profileVersion,
          ruleVersion: opportunity.ruleVersion,
          payloadHash: teamPayloadHash,
          consentId: leaderSnapshot.consentId,
          submittedAt: new Date(),
          revision: 1,
        });

    const revisionRecord = Object.freeze({
      id: `rev_${crypto.randomUUID()}`,
      applicationId: application.id,
      revision: application.revision,
      previewId: application.props.previewId,
      snapshotId: application.props.snapshotId,
      profileVersion: application.props.profileVersion,
      ruleVersion: opportunity.ruleVersion,
      snapshotJson: teamSnapshotJson,
      manifestJson: teamManifestJson,
      payloadHash: teamPayloadHash,
      consentId: application.props.consentId,
      screening: application.screening,
      screeningReasons: application.screeningReasons,
      rosterVersion: dto.rosterVersion ?? 1,
      memberSnapshots: Object.freeze(memberSnapshots),
      consentRefs: Object.freeze(consentRefs),
      submittedAt: application.props.submittedAt,
    });

    const eventRecord = Object.freeze({
      id: `evt_${crypto.randomUUID()}`,
      applicationId: application.id,
      actorId: leaderId,
      fromStatus: existingTeamApp?.status,
      toStatus: application.status,
      revision: application.revision,
      reason: existingTeamApp ? 'TEAM_RESUBMITTED' : 'TEAM_INITIAL_SUBMISSION',
    });

    const submissionIntent: SubmissionIntentRecord = Object.freeze({
      submissionId: dto.submissionId,
      opportunityId: dto.opportunityId,
      teamId: dto.teamId,
      leaderId,
      status: 'COMMITTED',
      applicationId: application.id,
      reservationId: dto.reservationId,
      fencingToken: dto.fencingToken,
      rosterVersion: dto.rosterVersion ?? 1,
      memberIds: Object.freeze([...memberIds]),
    });

    const outboxRecord = Object.freeze({
      eventId: `out_${crypto.randomUUID()}`,
      type: existingTeamApp ? 'application.resubmitted' : 'application.submitted',
      occurredAt: new Date(),
      producer: 'opportunity-service',
      aggregateId: application.id,
      aggregateVersion: application.version,
      correlationId: dto.submissionId,
      data: {
        applicationId: application.id,
        opportunityId: application.opportunityId,
        studentId: leaderId,
        teamId: dto.teamId,
        submissionId: dto.submissionId,
        submissionType: 'TEAM',
        rosterVersion: dto.rosterVersion ?? 1,
        memberIds,
        revision: application.revision,
        status: application.status,
        screening: application.screening,
      },
    });

    if (this.applicationRepo.commitSubmissionWithOutbox) {
      await this.applicationRepo.commitSubmissionWithOutbox({
        application,
        isResubmission: Boolean(existingTeamApp),
        revision: revisionRecord,
        event: eventRecord,
        outbox: outboxRecord,
        submissionIntent,
        activeMemberIds: memberIds,
      });
    } else {
      if (existingTeamApp) {
        await this.applicationRepo.update(application);
      } else {
        await this.applicationRepo.save(application);
      }
      if (this.applicationRepo.upsertSubmissionIntent) {
        await this.applicationRepo.upsertSubmissionIntent({
          submissionId: dto.submissionId,
          opportunityId: dto.opportunityId,
          teamId: dto.teamId,
          leaderId,
          status: 'COMMITTED',
          applicationId: application.id,
        });
      }
      await this.applicationRepo.saveRevision(revisionRecord);
      await this.applicationRepo.appendEvent(eventRecord);
    }

    if (this.collaborationGrpc && dto.reservationId) {
      try {
        await firstValueFrom(
          this.collaborationGrpc.confirmSubmission({
            team_id: dto.teamId,
            reservation_id: dto.reservationId,
            fencing_token: dto.fencingToken ?? 0,
          }),
        );
      } catch {
        // Outbox event `application.submitted` đảm bảo hội tụ bất đồng bộ theo Mục 28 SRS
      }
    }

    return Object.freeze({
      applicationId: application.id,
      revision: application.revision,
      status: application.status,
      screening: application.screening,
      screeningReasons: application.screeningReasons,
      submittedAt: application.props.submittedAt.toISOString(),
      ruleVersion: opportunity.ruleVersion,
      profileVersion: application.props.profileVersion,
      previewId: application.props.previewId,
      snapshotId: application.props.snapshotId,
      payloadHash: application.props.payloadHash,
      consentId: application.props.consentId,
      submissionType: 'TEAM',
      teamId: dto.teamId,
      submissionId: dto.submissionId,
      rosterVersion: dto.rosterVersion ?? 1,
      consentRefs: Object.freeze(consentRefs),
    });
  }

  async getMyApplications(studentId: string) {
    const applications = await this.applicationRepo.findManyByStudent(studentId);
    const labels = await this.loadOpportunityLabels(applications.map((app) => app.opportunityId));
    return applications.map((app) =>
      Object.freeze({
        ...app.props,
        id: app.id,
        screeningReasons: app.screeningReasons,
        submittedAt: app.props.submittedAt.toISOString(),
        version: app.version,
        opportunityTitle: labels.get(app.opportunityId)?.title ?? '',
        opportunityType: labels.get(app.opportunityId)?.type ?? '',
      }),
    );
  }

  /**
   * Title and type of each distinct opportunity, so student-facing lists can show
   * a readable name. Opportunities live in this service, so this is a local lookup.
   */
  private async loadOpportunityLabels(
    opportunityIds: readonly string[],
  ): Promise<Map<string, { title: string; type: string }>> {
    const unique = [...new Set(opportunityIds.filter(Boolean))];
    const found = await Promise.all(unique.map((id) => this.opportunityRepo.findById(id)));
    const labels = new Map<string, { title: string; type: string }>();
    found.forEach((opp, i) => {
      if (opp) labels.set(unique[i], { title: opp.title, type: String(opp.type) });
    });
    return labels;
  }

  /**
   * FR-APP-03 & FR-APP-08: Xem chi tiết hồ sơ ứng tuyển kèm lịch sử Revisions bất biến và Events.
   * Chỉ sinh viên sở hữu đơn hoặc thành viên trong đội mới có quyền xem (chặn 403 FORBIDDEN_RESOURCE nếu truy cập đơn người khác).
   */
  async getApplicationById(applicationId: string, studentId: string) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    const isOwnerOrTeamMember =
      application.studentId === studentId || application.memberIds.includes(studentId);
    if (!isOwnerOrTeamMember) {
      throw DomainException.forbidden('Bạn không có quyền xem hồ sơ ứng tuyển của sinh viên khác');
    }

    const [revisions, events, opportunity] = await Promise.all([
      this.applicationRepo.findRevisionsByApplicationId
        ? this.applicationRepo.findRevisionsByApplicationId(application.id)
        : Promise.resolve([]),
      this.applicationRepo.findEventsByApplicationId
        ? this.applicationRepo.findEventsByApplicationId(application.id)
        : Promise.resolve([]),
      this.opportunityRepo.findById(application.opportunityId),
    ]);

    // FR-APP-07: the app shows withdraw/resubmit from these flags instead of re-deriving the rules.
    // Only the owner (team leader for TEAM) may act, and only while registration is open.
    const viewerIsOwner = application.studentId === studentId;
    const registrationOpen = Boolean(opportunity?.isRegistrationOpen());
    const deadline = opportunity?.registerDeadline ? new Date(opportunity.registerDeadline) : null;
    const isTeam = application.props.submissionType === 'TEAM';

    return Object.freeze({
      ...application.props,
      id: application.id,
      screeningReasons: application.screeningReasons,
      submittedAt: application.props.submittedAt.toISOString(),
      version: application.version,
      opportunityTitle: opportunity?.title ?? '',
      opportunityType: opportunity ? String(opportunity.type) : '',
      registrationDeadline: deadline && !isNaN(deadline.getTime()) ? deadline.toISOString() : '',
      viewerIsOwner,
      canWithdraw: viewerIsOwner && registrationOpen && application.isWithdrawable(),
      canResubmit: viewerIsOwner && registrationOpen && application.canResubmit(),
      revisions: revisions.map((r) =>
        Object.freeze({
          ...(isTeam ? this.teamRevisionVisibleTo(r, studentId) : r),
          submittedAt: r.submittedAt.toISOString(),
        }),
      ),
      // Timeline needs when each status change happened (FR-APP-03).
      events: events.map((e) =>
        Object.freeze({
          ...e,
          createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
        }),
      ),
    });
  }

  /**
   * FR-APP-08 & Mục 7 SRS: mỗi thành viên chỉ đồng ý chia sẻ snapshot của mình với đơn vị tổ chức,
   * nên trong đội (kể cả trưởng đội) chỉ thấy snapshot của chính mình và tên các thành viên khác.
   */
  private teamRevisionVisibleTo(
    revision: ApplicationRevisionRecord,
    viewerId: string,
  ): ApplicationRevisionRecord {
    const isViewer = (item: { studentId?: unknown }) => item.studentId === viewerId;
    const snapshot = parseJsonObject(revision.snapshotJson);
    const members = Array.isArray(snapshot.members)
      ? (snapshot.members as Array<Record<string, unknown>>).map((member) =>
          isViewer(member)
            ? member
            : {
                studentId: member.studentId,
                snapshotRestricted: true,
                snapshot: {
                  fullName: (member.snapshot as { fullName?: unknown } | undefined)?.fullName ?? '',
                },
              },
        )
      : null;

    let manifest: unknown = [];
    try {
      manifest = JSON.parse(revision.manifestJson);
    } catch {
      manifest = [];
    }

    return {
      ...revision,
      snapshotJson: members ? JSON.stringify({ ...snapshot, members }) : revision.snapshotJson,
      manifestJson: Array.isArray(manifest)
        ? JSON.stringify((manifest as Array<{ studentId?: unknown }>).filter(isViewer))
        : revision.manifestJson,
      memberSnapshots: (revision.memberSnapshots ?? []).filter(isViewer),
      consentRefs: (revision.consentRefs ?? []).filter(isViewer),
    };
  }

  /**
   * FR-APP-07 & Mục 11, 12C, 28 SRS: Rút hồ sơ trước hạn, giải phóng application_members và phát sự kiện Outbox `application.withdrawn`
   */
  async withdraw(applicationId: string, studentId: string) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    if (application.studentId !== studentId) {
      throw DomainException.forbidden(
        application.props.submissionType === 'TEAM'
          ? 'Chỉ trưởng đội mới có quyền rút hồ sơ ứng tuyển của đội'
          : 'Bạn không có quyền rút hồ sơ của sinh viên khác',
      );
    }

    const opportunity = await this.opportunityRepo.findById(application.opportunityId);
    if (opportunity && !opportunity.isRegistrationOpen()) {
      throw DomainException.conflict(
        ErrorCode.DEADLINE_PASSED,
        'Không thể rút hồ sơ sau khi cơ hội đã hết hạn đăng ký',
      );
    }

    const withdrawn = application.withdraw();
    const eventRecord = Object.freeze({
      id: `evt_${crypto.randomUUID()}`,
      applicationId: withdrawn.id,
      actorId: studentId,
      fromStatus: application.status,
      toStatus: withdrawn.status,
      revision: withdrawn.revision,
      reason:
        withdrawn.props.submissionType === 'TEAM' ? 'TEAM_LEADER_WITHDRAWN' : 'STUDENT_WITHDRAWN',
    });

    const outboxRecord = Object.freeze({
      eventId: `out_${crypto.randomUUID()}`,
      type: 'application.withdrawn',
      occurredAt: new Date(),
      producer: 'opportunity-service',
      aggregateId: withdrawn.id,
      aggregateVersion: withdrawn.version,
      correlationId: withdrawn.id,
      data: {
        applicationId: withdrawn.id,
        opportunityId: withdrawn.opportunityId,
        studentId,
        teamId: withdrawn.teamId,
        submissionType: withdrawn.props.submissionType,
        revision: withdrawn.revision,
        status: withdrawn.status,
      },
    });

    if (this.applicationRepo.commitWithdrawalWithOutbox) {
      await this.applicationRepo.commitWithdrawalWithOutbox({
        application: withdrawn,
        event: eventRecord,
        outbox: outboxRecord,
      });
    } else {
      await this.applicationRepo.update(withdrawn);
      if (this.applicationRepo.releaseApplicationMembers) {
        await this.applicationRepo.releaseApplicationMembers(withdrawn.id);
      }
      await this.applicationRepo.appendEvent(eventRecord);
    }

    return Object.freeze({
      applicationId: withdrawn.id,
      status: withdrawn.status,
      revision: withdrawn.revision,
      version: withdrawn.version,
    });
  }

  private ensureTeamCompetitionOpen(opportunity: Opportunity) {
    if (opportunity.type !== 'COMPETITION' || opportunity.props.competitionMode !== 'TEAM') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Chỉ cơ hội loại Cuộc thi theo Đội (COMPETITION - TEAM) mới hỗ trợ nộp hồ sơ đội',
      );
    }
    if (opportunity.applyMode !== 'IN_APP') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Cơ hội EXTERNAL không tiếp nhận hồ sơ trực tiếp trên Scholink',
      );
    }
    if (!opportunity.isRegistrationOpen()) {
      throw DomainException.conflict(ErrorCode.DEADLINE_PASSED, 'Đã hết hạn đăng ký nộp hồ sơ');
    }
  }

  private validateTeamRosterBounds(
    opportunity: Opportunity,
    leaderId: string,
    memberIds: readonly string[],
  ) {
    if (!memberIds.includes(leaderId)) {
      throw DomainException.forbidden(
        'Trưởng đội thực hiện nộp hồ sơ phải nằm trong danh sách thành viên của đội',
      );
    }

    const uniqueMembers = new Set(memberIds);
    if (uniqueMembers.size !== memberIds.length) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        'Danh sách thành viên trong đội không được trùng lặp',
        400,
      );
    }

    const minSize = opportunity.props.minTeamSize ?? 2;
    const maxSize = opportunity.props.maxTeamSize ?? 20;
    if (memberIds.length < minSize || memberIds.length > maxSize) {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        `Số lượng thành viên đội (${memberIds.length}) phải nằm trong khoảng từ ${minSize} đến ${maxSize} người`,
      );
    }
  }

  private async ensureNoActiveMemberConflict(
    opportunityId: string,
    memberIds: readonly string[],
    excludeApplicationId?: string,
  ) {
    if (!this.applicationRepo.findActiveMembersByOpportunityAndStudents) {
      return;
    }

    const activeRecords = await this.applicationRepo.findActiveMembersByOpportunityAndStudents(
      opportunityId,
      memberIds,
    );
    const conflicts = activeRecords.filter(
      (rec) => rec.isActive && rec.applicationId !== excludeApplicationId,
    );

    if (conflicts.length > 0) {
      const conflictedStudents = conflicts.map((c) => c.studentId).join(', ');
      throw DomainException.conflict(
        ErrorCode.ALREADY_APPLIED,
        `Thành viên (${conflictedStudents}) đang thuộc một hồ sơ đội khác còn hiệu lực của cuộc thi này`,
      );
    }
  }

  private verifyPreviewMatch(
    preview: SubmissionPreviewRecord,
    studentId: string,
    expected: {
      opportunityId: string;
      snapshotId: string;
      profileVersion: number;
      payloadHash: string;
    },
    currentRuleVersion: number,
  ) {
    if (preview.actorId !== studentId) {
      throw DomainException.forbidden('Bản Preview không thuộc quyền sở hữu của thành viên này');
    }
    if (new Date() > preview.expiresAt) {
      throw DomainException.gone(
        ErrorCode.PREVIEW_EXPIRED,
        'Bản xem trước (Preview) đã hết hạn 10 phút, vui lòng tạo mới',
      );
    }
    if (preview.ruleVersion !== currentRuleVersion) {
      throw DomainException.conflict(
        ErrorCode.VERSION_MISMATCH,
        'Điều kiện của cơ hội đã thay đổi trước khi nộp',
      );
    }
    if (
      preview.opportunityId !== expected.opportunityId ||
      preview.snapshotId !== expected.snapshotId ||
      preview.profileVersion !== expected.profileVersion ||
      preview.payloadHash !== expected.payloadHash
    ) {
      throw DomainException.conflict(
        ErrorCode.CONSENT_MISMATCH,
        'Thông tin nộp không khớp với bản Preview bất biến đã tạo',
      );
    }
  }

  private async fetchProfileSnapshot(studentId: string, attachmentIds: string[]) {
    if (this.identityGrpc) {
      return firstValueFrom(
        this.identityGrpc.getProfileSnapshot({
          studentId,
          attachmentIds,
        }),
      );
    }

    const fallbackSnapshot = { studentId, profileVersion: 1 };
    const fallbackManifest = attachmentIds.sort().map((assetId) => ({ assetId, status: 'READY' }));
    return {
      snapshotId: `snap_${crypto.randomUUID()}`,
      profileVersion: 1,
      completionScore: 100,
      snapshotJson: JSON.stringify(fallbackSnapshot),
      manifestJson: JSON.stringify(fallbackManifest),
      manifestHash: this.cryptoService.generatePayloadHash({ attachments: fallbackManifest }),
      missingFields: [] as string[],
    };
  }

  // =========================================================================
  // SCHOL-14: ORGANIZER KANBAN, DETAIL, ATTACHMENTS & STATUS MANAGEMENT
  // =========================================================================
  async getOpportunityKanban(opportunityId: string, caller: AuthenticatedUser) {
    const opportunity = await this.opportunityRepo.findById(opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội (Học bổng / Cuộc thi)');
    }

    // SCHOL-14: Scoped strictly to caller organization (unless Admin)
    if (caller.role !== 'ADMIN') {
      if (!caller.organizationId || opportunity.props.organizationId !== caller.organizationId) {
        throw DomainException.forbidden('Bạn không có quyền truy cập hồ sơ của đơn vị khác');
      }
    }

    const applications = await this.applicationRepo.findManyByOpportunity(opportunityId);

    const columns: Record<string, any[]> = {
      SUBMITTED: [],
      REVIEWING: [],
      SHORTLISTED: [],
      INTERVIEW: [],
      ACCEPTED: [],
      REJECTED: [],
    };

    for (const app of applications) {
      const col = columns[app.status] ? app.status : 'SUBMITTED';
      columns[col].push({
        ...app.props,
        id: app.id,
        version: app.version,
      });
    }

    return {
      opportunityId,
      opportunityTitle: opportunity.props.title,
      totalApplications: applications.length,
      columns: {
        APPLIED: columns.SUBMITTED,
        REVIEWING: columns.REVIEWING,
        SHORTLISTED: columns.SHORTLISTED,
        INTERVIEW: columns.INTERVIEW,
        ACCEPTED: columns.ACCEPTED,
        REJECTED: columns.REJECTED,
      },
    };
  }

  async getApplicationDetail(applicationId: string, caller: AuthenticatedUser) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    const opportunity = await this.opportunityRepo.findById(application.opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }

    // SCHOL-14: Scoped strictly to caller organization (unless Admin)
    if (caller.role !== 'ADMIN') {
      if (!caller.organizationId || opportunity.props.organizationId !== caller.organizationId) {
        throw DomainException.forbidden('Bạn không có quyền xem chi tiết hồ sơ của đơn vị khác');
      }
    }

    const latestRevision = this.applicationRepo.findLatestRevision
      ? await this.applicationRepo.findLatestRevision(applicationId)
      : null;
    const events = this.applicationRepo.findEventsByApplication
      ? await this.applicationRepo.findEventsByApplication(applicationId)
      : this.applicationRepo.findEventsByApplicationId
        ? await this.applicationRepo.findEventsByApplicationId(applicationId)
        : [];

    return {
      ...application.props,
      id: application.id,
      version: application.version,
      opportunityTitle: opportunity.props.title,
      organizationId: opportunity.props.organizationId,
      revision: latestRevision,
      history: events,
    };
  }

  async getApplicationAttachments(applicationId: string, caller: AuthenticatedUser) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    const opportunity = await this.opportunityRepo.findById(application.opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }

    // SCHOL-14: Scoped strictly to caller organization (unless Admin)
    if (caller.role !== 'ADMIN') {
      if (!caller.organizationId || opportunity.props.organizationId !== caller.organizationId) {
        throw DomainException.forbidden('Bạn không có quyền truy cập tệp hồ sơ của đơn vị khác');
      }
    }

    const latestRevision = this.applicationRepo.findLatestRevision
      ? await this.applicationRepo.findLatestRevision(applicationId)
      : null;
    let attachments: any[] = [];
    if (latestRevision?.manifestJson) {
      try {
        attachments = JSON.parse(latestRevision.manifestJson);
      } catch {
        attachments = [];
      }
    }

    return {
      applicationId: application.id,
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.props.title,
      manifestHash: latestRevision?.payloadHash,
      attachments,
    };
  }

  async updateStatus(
    applicationId: string,
    caller: AuthenticatedUser,
    dto: { status: string; expectedVersion?: number; note?: string },
  ) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    const opportunity = await this.opportunityRepo.findById(application.opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }

    // SCHOL-14: Scoped strictly to caller organization (unless Admin)
    if (caller.role !== 'ADMIN') {
      if (!caller.organizationId || opportunity.props.organizationId !== caller.organizationId) {
        throw DomainException.forbidden('Bạn không có quyền thay đổi trạng thái hồ sơ của đơn vị khác');
      }
    }

    // SCHOL-14: Yêu cầu lý do/ghi chú khi từ chối hồ sơ
    if (dto.status === 'REJECTED' && (!dto.note || !dto.note.trim())) {
      throw DomainException.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        'Lý do từ chối (note) là bắt buộc khi chuyển trạng thái sang REJECTED',
      );
    }

    // SCHOL-14: Optimistic locking version
    if (dto.expectedVersion !== undefined && application.version !== dto.expectedVersion) {
      throw new DomainException(
        ErrorCode.VERSION_MISMATCH,
        `Xung đột phiên bản dữ liệu (Expected: ${dto.expectedVersion}, Current: ${application.version}). Vui lòng tải lại bảng Kanban.`,
        409,
      );
    }

    const updated = application.changeStatus(dto.status as any);
    await this.applicationRepo.update(updated);

    if (!updated.isActiveMemberHoldingStatus() && this.applicationRepo.releaseApplicationMembers) {
      await this.applicationRepo.releaseApplicationMembers(updated.id);
    }

    await this.applicationRepo.appendEvent({
      id: `evt_${crypto.randomUUID()}`,
      applicationId: updated.id,
      actorId: caller.userId,
      fromStatus: application.status,
      toStatus: updated.status,
      revision: updated.revision,
      reason: dto.note || 'ORGANIZER_STATUS_UPDATE',
    });

    return {
      applicationId: updated.id,
      status: updated.status,
      version: updated.version,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * F40 Backend — FR-APP-01/05, Mục 29 & D06 SRS:
   * Giữ hoặc xóa/ẩn danh Snapshot ứng tuyển theo quyết định khi tài khoản bị xóa.
   */
  async applySnapshotRetentionDecision(dto: ApplySnapshotRetentionDto) {
    if (this.applicationRepo.applySnapshotRetentionByStudent) {
      const summary = await this.applicationRepo.applySnapshotRetentionByStudent({
        studentId: dto.studentId,
        decision: dto.decision,
        trackingId: dto.trackingId,
      });
      return Object.freeze({
        ...summary,
        trackingId: summary.trackingId ?? '',
        processedAt: summary.processedAt.toISOString(),
      });
    }

    const purgedPreviewsCount = this.applicationRepo.deletePreviewsByStudent
      ? await this.applicationRepo.deletePreviewsByStudent(dto.studentId)
      : 0;

    return Object.freeze({
      studentId: dto.studentId,
      decision: dto.decision,
      trackingId: dto.trackingId ?? '',
      purgedPreviewsCount,
      withdrawnApplicationsCount: 0,
      retainedSnapshotsCount: 0,
      purgedSnapshotsCount: 0,
      processedAt: new Date().toISOString(),
    });
  }

  /**
   * F40 Backend — Mục 30 SRS & NFR11:
   * Ghi nhận nhật ký kết quả kiểm thử (Test Result Log) và kiểm tra điều kiện hoàn thành AC.
   * Bất biến nghiệm thu: Không bao giờ được claim đủ AC (`canClaimAc = false`, `canClaimAllAc = false`)
   * khi vẫn còn bất kỳ ca kiểm thử nào ở trạng thái `NOT_RUN` hoặc `FAILED`.
   */
  async evaluateTestResultLog(dto: EvaluateTestResultLogDto) {
    const runId = dto.runId?.trim() || `trun_${crypto.randomUUID()}`;
    const groupedByAc = new Map<
      string,
      Array<{
        tcId: string;
        acId: string;
        title: string;
        status: 'PASSED' | 'FAILED' | 'NOT_RUN';
        note?: string;
      }>
    >();

    for (const rawTc of dto.testCases ?? []) {
      const normalizedTc = {
        tcId: String(rawTc.tcId ?? ''),
        acId: String(rawTc.acId ?? ''),
        title: String(rawTc.title ?? ''),
        status: (rawTc.status ?? 'NOT_RUN') as 'PASSED' | 'FAILED' | 'NOT_RUN',
        note: rawTc.note,
      };
      const existing = groupedByAc.get(normalizedTc.acId) ?? [];
      existing.push(normalizedTc);
      groupedByAc.set(normalizedTc.acId, existing);
    }

    const acSummaries = Array.from(groupedByAc.entries()).map(([acId, cases]) => {
      const totalCases = cases.length;
      const passedCases = cases.filter((c) => c.status === 'PASSED').length;
      const failedCases = cases.filter((c) => c.status === 'FAILED').length;
      const notRunCases = cases.filter((c) => c.status === 'NOT_RUN').length;
      const canClaimAc = totalCases > 0 && notRunCases === 0 && failedCases === 0;
      const acStatus =
        failedCases > 0
          ? 'FAILED'
          : notRunCases > 0
            ? 'INCOMPLETE_NOT_RUN'
            : 'VERIFIED';

      return Object.freeze({
        acId,
        totalCases,
        passedCases,
        failedCases,
        notRunCases,
        canClaimAc,
        acStatus,
      });
    });

    const totalCases = dto.testCases.length;
    const passedCases = dto.testCases.filter((c) => c.status === 'PASSED').length;
    const failedCases = dto.testCases.filter((c) => c.status === 'FAILED').length;
    const notRunCases = dto.testCases.filter((c) => c.status === 'NOT_RUN').length;
    const canClaimAllAc =
      acSummaries.length > 0 && acSummaries.every((summary) => summary.canClaimAc);

    if (dto.strictClaim && !canClaimAllAc) {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Không được phép claim đủ AC khi vẫn còn ca kiểm thử ở trạng thái NOT_RUN hoặc FAILED',
      );
    }

    return Object.freeze({
      runId,
      evaluatedAt: new Date().toISOString(),
      totalCases,
      passedCases,
      failedCases,
      notRunCases,
      canClaimAllAc,
      acSummaries: Object.freeze(acSummaries),
    });
  }
}
