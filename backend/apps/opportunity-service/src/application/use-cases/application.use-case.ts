import { Injectable, Inject, Optional, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import {
  IApplicationRepository,
  APPLICATION_REPOSITORY,
  SubmissionPreviewRecord,
} from '../../domain/ports/application.repository.port';
import {
  IOpportunityRepository,
  OPPORTUNITY_REPOSITORY,
} from '../../domain/ports/opportunity.repository.port';
import { Application } from '../../domain/application.entity';
import { CreatePreviewDto, SubmitApplicationDto } from '../dtos/opportunity.dto';
import { DomainException, ErrorCode, CryptoService, AuthenticatedUser } from '@shared';

export const IDENTITY_GRPC_CLIENT = Symbol('IDENTITY_GRPC_CLIENT');

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
  }): Observable<{
    valid: boolean;
    profileVersion: number;
  }>;
}

const PREVIEW_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ApplicationUseCase implements OnModuleInit {
  private identityGrpc?: IdentityGrpcClientService;

  constructor(
    @Inject(APPLICATION_REPOSITORY)
    private readonly applicationRepo: IApplicationRepository,
    @Inject(OPPORTUNITY_REPOSITORY)
    private readonly opportunityRepo: IOpportunityRepository,
    private readonly cryptoService: CryptoService,
    @Optional()
    @Inject(IDENTITY_GRPC_CLIENT)
    private readonly identityClient?: ClientGrpc,
  ) {}

  onModuleInit() {
    if (this.identityClient) {
      this.identityGrpc =
        this.identityClient.getService<IdentityGrpcClientService>('IdentityGrpcService');
    }
  }

  /**
   * Mục 6 WF04 & Mục 26 SRS: Tạo bản Preview bất biến (TTL 10 phút) trước khi xin Consent
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
    if (profileData.missingFields && profileData.missingFields.length > 0) {
      throw DomainException.unprocessable(
        ErrorCode.PROFILE_INCOMPLETE,
        'Hồ sơ Passport còn thiếu trường bắt buộc',
        profileData.missingFields,
      );
    }

    // Mục 26 SRS: PayloadHash là SHA-256 JSON chuẩn hóa RFC 8785 của snapshot, ruleVersion và manifest tệp
    const payloadHash = this.cryptoService.generatePayloadHash({
      snapshot: JSON.parse(profileData.snapshotJson),
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
      screening: 'ELIGIBLE',
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
   * Mục 6 WF04 & Mục 26 SRS: Commit Application từ đúng bản Preview đã xem và Consent đã xác thực
   */
  async submit(studentId: string, dto: SubmitApplicationDto) {
    const opportunity = await this.opportunityRepo.findById(dto.opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội');
    }

    if (!opportunity.isRegistrationOpen()) {
      throw DomainException.conflict(ErrorCode.DEADLINE_PASSED, 'Đã hết hạn đăng ký nộp hồ sơ');
    }

    // SCHOL-20: Team submission intent check to resolve concurrent commit/abort race
    if (dto.submissionType === 'TEAM' && dto.teamId) {
      const intent = await this.applicationRepo.findSubmissionIntent(dto.teamId, dto.submissionId);
      if (intent?.status === 'ABORTED') {
        throw DomainException.conflict(
          ErrorCode.HOLD_EXPIRED,
          'Phiên nộp hồ sơ đội đã bị hủy do quá hạn thời gian giữ chỗ (Lease Expired)',
        );
      }
    }

    const preview = await this.applicationRepo.findPreviewById(dto.previewId);
    if (preview) {
      this.verifyPreviewMatch(preview, studentId, dto, opportunity.ruleVersion);
    }

    if (this.identityGrpc) {
      await firstValueFrom(
        this.identityGrpc.validateConsent({
          studentId,
          consentId: dto.consentId,
          previewId: dto.previewId,
          snapshotId: dto.snapshotId,
          opportunityId: dto.opportunityId,
          expectedRuleVersion: opportunity.ruleVersion,
          expectedPayloadHash: preview ? preview.payloadHash : dto.payloadHash,
        }),
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

    const application = existing
      ? existing.resubmit({
          previewId: dto.previewId,
          snapshotId: dto.snapshotId,
          profileVersion: dto.profileVersion,
          ruleVersion: opportunity.ruleVersion,
          payloadHash: dto.payloadHash,
          consentId: dto.consentId,
          screening: preview?.screening ?? 'ELIGIBLE',
        })
      : new Application(`app_${crypto.randomUUID()}`, {
          opportunityId: dto.opportunityId,
          studentId,
          teamId: dto.teamId,
          submissionType: dto.submissionType,
          status: 'SUBMITTED',
          screening: preview?.screening ?? 'ELIGIBLE',
          previewId: dto.previewId,
          snapshotId: dto.snapshotId,
          profileVersion: dto.profileVersion,
          ruleVersion: opportunity.ruleVersion,
          payloadHash: dto.payloadHash,
          consentId: dto.consentId,
          submittedAt: new Date(),
          revision: 1,
        });

    if (existing) {
      await this.applicationRepo.update(application);
    } else {
      await this.applicationRepo.save(application);
    }

    // SCHOL-20: Atomic record/commit of submission intent
    if (dto.submissionType === 'TEAM' && dto.teamId) {
      await this.applicationRepo.upsertSubmissionIntent({
        submissionId: dto.submissionId,
        opportunityId: dto.opportunityId,
        teamId: dto.teamId,
        leaderId: studentId,
        status: 'COMMITTED',
        applicationId: application.id,
      });
    }

    await this.applicationRepo.saveRevision({
      id: `rev_${crypto.randomUUID()}`,
      applicationId: application.id,
      revision: application.revision,
      previewId: application.props.previewId,
      snapshotId: application.props.snapshotId,
      profileVersion: application.props.profileVersion,
      ruleVersion: application.props.ruleVersion ?? 1,
      snapshotJson: preview?.snapshotJson ?? '{}',
      manifestJson: preview?.manifestJson ?? '[]',
      payloadHash: application.props.payloadHash,
      consentId: application.props.consentId,
      screening: application.screening,
      submittedAt: application.props.submittedAt,
    });

    await this.applicationRepo.appendEvent({
      id: `evt_${crypto.randomUUID()}`,
      applicationId: application.id,
      actorId: studentId,
      fromStatus: existing?.status,
      toStatus: application.status,
      revision: application.revision,
    });

    return Object.freeze({
      applicationId: application.id,
      revision: application.revision,
      status: application.status,
      screening: application.screening,
      submittedAt: application.props.submittedAt.toISOString(),
      ruleVersion: application.props.ruleVersion ?? 1,
      profileVersion: application.props.profileVersion,
      previewId: application.props.previewId,
      snapshotId: application.props.snapshotId,
      payloadHash: application.props.payloadHash,
      consentId: application.props.consentId,
    });
  }

  // SCHOL-20 requirement 5: Opportunity AbortSubmissionIntent resolution
  async abortSubmissionIntent(data: {
    teamId: string;
    reservationId: string;
    fencingToken: number;
    reason?: string;
  }): Promise<{ outcome: 'ABORTED' | 'COMMITTED'; message: string }> {
    // 1. Check if application is already committed
    const existing = await this.applicationRepo.findApplicationByTeamId(data.teamId);
    if (existing && existing.status === 'SUBMITTED') {
      return {
        outcome: 'COMMITTED',
        message: 'Hồ sơ đội đã được nộp thành công trước đó (COMMITTED)',
      };
    }

    const intent = await this.applicationRepo.findSubmissionIntent(data.teamId, data.reservationId);
    if (intent?.status === 'COMMITTED') {
      return {
        outcome: 'COMMITTED',
        message: 'Intent đã được ghi nhận COMMITTED',
      };
    }

    // 2. Abort intent atomically so subsequent commit is rejected
    await this.applicationRepo.upsertSubmissionIntent({
      submissionId: data.reservationId,
      opportunityId: '',
      teamId: data.teamId,
      leaderId: '',
      status: 'ABORTED',
    });

    return {
      outcome: 'ABORTED',
      message: `Intent đã bị hủy thành công (${data.reason || 'Timeout Worker'})`,
    };
  }

  async getMyApplications(studentId: string) {
    const applications = await this.applicationRepo.findManyByStudent(studentId);
    return applications.map((app) =>
      Object.freeze({
        ...app.props,
        id: app.id,
        submittedAt: app.props.submittedAt.toISOString(),
        version: app.version,
      }),
    );
  }

  async withdraw(applicationId: string, studentId: string) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    if (application.studentId !== studentId) {
      throw DomainException.forbidden('Bạn không có quyền rút hồ sơ của sinh viên khác');
    }

    const withdrawn = application.withdraw();
    await this.applicationRepo.update(withdrawn);

    await this.applicationRepo.appendEvent({
      id: `evt_${crypto.randomUUID()}`,
      applicationId: withdrawn.id,
      actorId: studentId,
      fromStatus: application.status,
      toStatus: withdrawn.status,
      revision: withdrawn.revision,
      reason: 'STUDENT_WITHDRAWN',
    });

    return Object.freeze({
      applicationId: withdrawn.id,
      status: withdrawn.status,
      revision: withdrawn.revision,
      version: withdrawn.version,
    });
  }

  private verifyPreviewMatch(
    preview: SubmissionPreviewRecord,
    studentId: string,
    dto: SubmitApplicationDto,
    currentRuleVersion: number,
  ) {
    if (preview.actorId !== studentId) {
      throw DomainException.forbidden('Bản Preview không thuộc quyền sở hữu của bạn');
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
      preview.opportunityId !== dto.opportunityId ||
      preview.snapshotId !== dto.snapshotId ||
      preview.profileVersion !== dto.profileVersion ||
      preview.payloadHash !== dto.payloadHash
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

    const latestRevision = await this.applicationRepo.findLatestRevision(applicationId);
    const events = await this.applicationRepo.findEventsByApplication(applicationId);

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

    const latestRevision = await this.applicationRepo.findLatestRevision(applicationId);
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
}
