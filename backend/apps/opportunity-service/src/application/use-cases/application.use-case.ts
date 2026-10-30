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
import { DomainException, ErrorCode, CryptoService } from '@shared';

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
    attachmentIds?: string[];
    requiredScope?: string[];
  }): Observable<{
    valid: boolean;
    profileVersion: number;
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
   * Mục 6 WF04, FR-APP-01/02/03/07 & Mục 26, 27, 28 SRS:
   * Commit Application từ đúng bản Preview bất biến đã xem, xác thực Consent + Scope + Asset READY,
   * kiểm tra Business Uniqueness và ghi Outbox trong cùng 1 transaction.
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

    const preview = await this.applicationRepo.findPreviewById(dto.previewId);
    if (!preview) {
      throw DomainException.notFound('Bản xem trước (Preview)');
    }

    this.verifyPreviewMatch(preview, studentId, dto, opportunity.ruleVersion);

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
          screening: evaluation.screening,
          screeningReasons: evaluation.screeningReasons,
        })
      : new Application(`app_${crypto.randomUUID()}`, {
          opportunityId: dto.opportunityId,
          studentId,
          teamId: dto.teamId,
          submissionType: dto.submissionType,
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
    });
  }

  async getMyApplications(studentId: string) {
    const applications = await this.applicationRepo.findManyByStudent(studentId);
    return applications.map((app) =>
      Object.freeze({
        ...app.props,
        id: app.id,
        screeningReasons: app.screeningReasons,
        submittedAt: app.props.submittedAt.toISOString(),
        version: app.version,
      }),
    );
  }

  /**
   * FR-APP-03 & FR-APP-08: Xem chi tiết hồ sơ ứng tuyển kèm lịch sử Revisions bất biến và Events.
   * Chỉ sinh viên sở hữu đơn mới có quyền xem (chặn 403 FORBIDDEN_RESOURCE nếu truy cập đơn người khác).
   */
  async getApplicationById(applicationId: string, studentId: string) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    if (application.studentId !== studentId) {
      throw DomainException.forbidden('Bạn không có quyền xem hồ sơ ứng tuyển của sinh viên khác');
    }

    const [revisions, events] = await Promise.all([
      this.applicationRepo.findRevisionsByApplicationId
        ? this.applicationRepo.findRevisionsByApplicationId(application.id)
        : Promise.resolve([]),
      this.applicationRepo.findEventsByApplicationId
        ? this.applicationRepo.findEventsByApplicationId(application.id)
        : Promise.resolve([]),
    ]);

    return Object.freeze({
      ...application.props,
      id: application.id,
      screeningReasons: application.screeningReasons,
      submittedAt: application.props.submittedAt.toISOString(),
      version: application.version,
      revisions: revisions.map((r) =>
        Object.freeze({
          ...r,
          submittedAt: r.submittedAt.toISOString(),
        }),
      ),
      events,
    });
  }

  /**
   * FR-APP-07 & Mục 11, 28 SRS: Rút hồ sơ trước hạn và phát sự kiện Outbox `application.withdrawn`
   */
  async withdraw(applicationId: string, studentId: string) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

    if (application.studentId !== studentId) {
      throw DomainException.forbidden('Bạn không có quyền rút hồ sơ của sinh viên khác');
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
      reason: 'STUDENT_WITHDRAWN',
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
      await this.applicationRepo.appendEvent(eventRecord);
    }

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

  // ==========================================
  // F24: ORGANIZER KANBAN & STATUS MANAGEMENT
  // ==========================================
  async getOpportunityKanban(opportunityId: string) {
    const opportunity = await this.opportunityRepo.findById(opportunityId);
    if (!opportunity) {
      throw DomainException.notFound('Cơ hội (Học bổng / Cuộc thi)');
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

  async updateStatus(
    applicationId: string,
    organizerId: string,
    dto: { status: string; expectedVersion?: number; note?: string },
  ) {
    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      throw DomainException.notFound('Hồ sơ ứng tuyển');
    }

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
      actorId: organizerId,
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
