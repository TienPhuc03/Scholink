import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { ClientSession, Connection, Model } from 'mongoose';
import {
  DomainException,
  ErrorCode,
  OutboxDocument,
  OutboxModel,
} from '@shared';
import {
  IApplicationRepository,
  SubmissionPreviewRecord,
  ApplicationRevisionRecord,
  ApplicationEventRecord,
  ApplicationMemberRecord,
  SubmissionIntentRecord,
  SubmissionIntentStatus,
  TeamMemberSnapshotRecord,
  TeamMemberConsentRefRecord,
  OutboxEventRecord,
} from '../../domain/ports/application.repository.port';
import { Application, ApplicationStatus, ScreeningStatus } from '../../domain/application.entity';
import { ScreeningReason } from '../../domain/opportunity.entity';
import {
  ApplicationModel,
  ApplicationDocument,
  SubmissionPreviewModel,
  SubmissionPreviewDocument,
  ApplicationRevisionModel,
  ApplicationRevisionDocument,
  ApplicationEventModel,
  ApplicationEventDocument,
  ApplicationMemberModel,
  ApplicationMemberDocument,
  SubmissionIntentModel,
  SubmissionIntentDocument,
} from './application.schema';

const isDuplicateKeyError = (err: unknown): boolean =>
  Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: number }).code === 11000,
  );

const isTransactionUnsupportedError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const msg = String((err as { message?: string }).message ?? '');
  return (
    msg.includes('Transaction numbers are only allowed on a replica set') ||
    msg.includes('transactions are not supported')
  );
};

@Injectable()
export class MongooseApplicationRepository implements IApplicationRepository {
  constructor(
    @InjectModel(ApplicationModel.name)
    private readonly model: Model<ApplicationDocument>,
    @InjectModel(SubmissionPreviewModel.name)
    private readonly previewModel: Model<SubmissionPreviewDocument>,
    @InjectModel(ApplicationRevisionModel.name)
    private readonly revisionModel: Model<ApplicationRevisionDocument>,
    @InjectModel(ApplicationEventModel.name)
    private readonly eventModel: Model<ApplicationEventDocument>,
    @InjectModel(ApplicationMemberModel.name)
    private readonly memberModel: Model<ApplicationMemberDocument>,
    @InjectModel(SubmissionIntentModel.name)
    private readonly intentModel: Model<SubmissionIntentDocument>,
    @InjectModel(OutboxModel.name)
    private readonly outboxModel: Model<OutboxDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async findById(id: string): Promise<Application | null> {
    const doc = await this.model
      .findOne({ id: { $eq: String(id) } })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByOpportunityAndStudent(
    opportunityId: string,
    studentId: string,
  ): Promise<Application | null> {
    const doc = await this.model
      .findOne({
        opportunityId: { $eq: String(opportunityId) },
        subjectType: { $eq: 'STUDENT' },
        studentId: { $eq: String(studentId) },
      })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByOpportunityAndTeam(
    opportunityId: string,
    teamId: string,
  ): Promise<Application | null> {
    const doc = await this.model
      .findOne({
        opportunityId: { $eq: String(opportunityId) },
        subjectType: { $eq: 'TEAM' },
        subjectId: { $eq: String(teamId) },
      })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findManyByStudent(studentId: string): Promise<Application[]> {
    const safeStudentId = String(studentId);
    const docs = await this.model
      .find({
        $or: [
          { studentId: { $eq: safeStudentId } },
          { memberIds: { $eq: safeStudentId } },
        ],
      })
      .sort({ submittedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findManyByOpportunity(opportunityId: string): Promise<Application[]> {
    const docs = await this.model
      .find({ opportunityId: { $eq: String(opportunityId) } })
      .sort({ submittedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async save(application: Application, session?: ClientSession): Promise<void> {
    const subjectType = application.props.submissionType === 'TEAM' ? 'TEAM' : 'STUDENT';
    const subjectId =
      subjectType === 'TEAM' && application.props.teamId
        ? application.props.teamId
        : application.studentId;

    try {
      await this.model.create(
        [
          {
            id: application.id,
            opportunityId: application.opportunityId,
            subjectType,
            subjectId,
            studentId: application.studentId,
            teamId: application.props.teamId,
            submissionId: application.props.submissionId,
            rosterVersion: application.props.rosterVersion,
            reservationId: application.props.reservationId,
            fencingToken: application.props.fencingToken,
            memberIds: [...application.memberIds],
            submissionType: application.props.submissionType,
            status: application.status,
            screening: application.screening,
            screeningReasons: [...application.screeningReasons],
            previewId: application.props.previewId,
            snapshotId: application.props.snapshotId,
            profileVersion: application.props.profileVersion,
            ruleVersion: application.props.ruleVersion ?? 1,
            payloadHash: application.props.payloadHash,
            consentId: application.props.consentId,
            submittedAt: application.props.submittedAt,
            revision: application.revision,
            version: application.version,
          },
        ],
        session ? { session } : undefined,
      );
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        throw DomainException.conflict(
          ErrorCode.ALREADY_APPLIED,
          'Bạn hoặc đội thi đã nộp hồ sơ cho cơ hội này rồi (Unique constraint)',
        );
      }
      throw err;
    }
  }

  async update(application: Application, session?: ClientSession): Promise<void> {
    await this.model
      .updateOne(
        { id: { $eq: String(application.id) } },
        {
          $set: {
            status: application.status,
            screening: application.screening,
            screeningReasons: [...application.screeningReasons],
            previewId: application.props.previewId,
            snapshotId: application.props.snapshotId,
            profileVersion: application.props.profileVersion,
            ruleVersion: application.props.ruleVersion ?? 1,
            payloadHash: application.props.payloadHash,
            consentId: application.props.consentId,
            submissionId: application.props.submissionId,
            rosterVersion: application.props.rosterVersion,
            reservationId: application.props.reservationId,
            fencingToken: application.props.fencingToken,
            memberIds: [...application.memberIds],
            submittedAt: application.props.submittedAt,
            revision: application.revision,
            version: application.version,
          },
        },
        session ? { session } : undefined,
      )
      .exec();

    // Mục 12C SRS: Giải phóng application_members khi chuyển sang REJECTED, WITHDRAWN, CANCELLED hoặc REOPENED
    if (!application.isActiveMemberHoldingStatus()) {
      await this.releaseApplicationMembers(application.id, session);
    }
  }

  async savePreview(preview: SubmissionPreviewRecord): Promise<void> {
    await this.previewModel.create({
      ...preview,
      screeningReasons: [...(preview.screeningReasons ?? [])],
    });
  }

  async findPreviewById(previewId: string): Promise<SubmissionPreviewRecord | null> {
    const doc = await this.previewModel
      .findOne({ previewId: { $eq: String(previewId) } })
      .lean()
      .exec();
    if (!doc) return null;
    return Object.freeze({
      previewId: doc.previewId,
      actorId: doc.actorId,
      opportunityId: doc.opportunityId,
      submissionId: doc.submissionId,
      snapshotId: doc.snapshotId,
      profileVersion: doc.profileVersion,
      ruleVersion: doc.ruleVersion,
      snapshotJson: doc.snapshotJson,
      manifestJson: doc.manifestJson,
      manifestHash: doc.manifestHash,
      payloadHash: doc.payloadHash,
      screening: doc.screening as ScreeningStatus,
      screeningReasons: Object.freeze(
        ((doc.screeningReasons ?? []) as unknown as ScreeningReason[]).map((r) =>
          Object.freeze({ ...r }),
        ),
      ),
      expiresAt: new Date(doc.expiresAt),
    });
  }

  async saveRevision(
    revision: ApplicationRevisionRecord,
    session?: ClientSession,
  ): Promise<void> {
    await this.revisionModel.create(
      [
        {
          ...revision,
          screeningReasons: [...(revision.screeningReasons ?? [])],
          memberSnapshots: [...(revision.memberSnapshots ?? [])],
          consentRefs: [...(revision.consentRefs ?? [])],
        },
      ],
      session ? { session } : undefined,
    );
  }

  async appendEvent(
    event: ApplicationEventRecord,
    session?: ClientSession,
  ): Promise<void> {
    await this.eventModel.create([event], session ? { session } : undefined);
  }

  async findRevisionsByApplicationId(
    applicationId: string,
  ): Promise<ApplicationRevisionRecord[]> {
    const docs = await this.revisionModel
      .find({ applicationId: { $eq: String(applicationId) } })
      .sort({ revision: -1 })
      .lean()
      .exec();

    return docs.map((doc) =>
      Object.freeze({
        id: doc.id,
        applicationId: doc.applicationId,
        revision: doc.revision,
        previewId: doc.previewId,
        snapshotId: doc.snapshotId,
        profileVersion: doc.profileVersion,
        ruleVersion: doc.ruleVersion,
        snapshotJson: doc.snapshotJson,
        manifestJson: doc.manifestJson,
        payloadHash: doc.payloadHash,
        consentId: doc.consentId,
        screening: doc.screening as ScreeningStatus,
        screeningReasons: Object.freeze(
          ((doc.screeningReasons ?? []) as unknown as ScreeningReason[]).map((r) =>
            Object.freeze({ ...r }),
          ),
        ),
        rosterVersion: doc.rosterVersion,
        memberSnapshots: Object.freeze(
          ((doc.memberSnapshots ?? []) as unknown as TeamMemberSnapshotRecord[]).map((ms) =>
            Object.freeze({ ...ms }),
          ),
        ),
        consentRefs: Object.freeze(
          ((doc.consentRefs ?? []) as unknown as TeamMemberConsentRefRecord[]).map((cr) =>
            Object.freeze({ ...cr }),
          ),
        ),
        submittedAt: new Date(doc.submittedAt),
      }),
    );
  }

  async findEventsByApplicationId(
    applicationId: string,
  ): Promise<ApplicationEventRecord[]> {
    const docs = await this.eventModel
      .find({ applicationId: { $eq: String(applicationId) } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return docs.map((doc) =>
      Object.freeze({
        id: doc.id,
        applicationId: doc.applicationId,
        actorId: doc.actorId,
        fromStatus: doc.fromStatus,
        toStatus: doc.toStatus,
        revision: doc.revision,
        reason: doc.reason,
      }),
    );
  }

  async findActiveMembersByOpportunityAndStudents(
    opportunityId: string,
    studentIds: readonly string[],
  ): Promise<ApplicationMemberRecord[]> {
    const safeStudents = studentIds.map((s) => String(s));
    if (safeStudents.length === 0) return [];

    const docs = await this.memberModel
      .find({
        opportunityId: { $eq: String(opportunityId) },
        studentId: { $in: safeStudents },
        isActive: { $eq: true },
      })
      .lean()
      .exec();

    return docs.map((doc) =>
      Object.freeze({
        id: doc.id,
        opportunityId: doc.opportunityId,
        applicationId: doc.applicationId,
        studentId: doc.studentId,
        isActive: doc.isActive,
      }),
    );
  }

  async releaseApplicationMembers(
    applicationId: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.memberModel
      .updateMany(
        {
          applicationId: { $eq: String(applicationId) },
          isActive: { $eq: true },
        },
        { $set: { isActive: false } },
        session ? { session } : undefined,
      )
      .exec();
  }

  async findSubmissionIntentById(
    submissionId: string,
  ): Promise<SubmissionIntentRecord | null> {
    const doc = await this.intentModel
      .findOne({ submissionId: { $eq: String(submissionId) } })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toIntentRecord(doc);
  }

  /**
   * Mục 7 WF07 & 27, 28 SRS: Tạo hoặc lấy Submission Intent ở trạng thái PENDING.
   * Nếu đã ABORTED thì từ chối ngay với HOLD_EXPIRED.
   */
  async createOrGetSubmissionIntent(
    intent: SubmissionIntentRecord,
  ): Promise<SubmissionIntentRecord> {
    const existing = await this.findSubmissionIntentById(intent.submissionId);
    if (existing) {
      if (existing.status === 'ABORTED') {
        throw DomainException.conflict(
          ErrorCode.HOLD_EXPIRED,
          'Phiên nộp hồ sơ đội (Submission Intent) đã bị hủy hoặc quá hạn lease',
        );
      }
      return existing;
    }

    try {
      const created = await this.intentModel.create({
        submissionId: intent.submissionId,
        opportunityId: intent.opportunityId,
        teamId: intent.teamId,
        leaderId: intent.leaderId,
        status: 'PENDING',
        reservationId: intent.reservationId,
        fencingToken: intent.fencingToken,
        rosterVersion: intent.rosterVersion,
        memberIds: [...(intent.memberIds ?? [])],
      });
      return this.toIntentRecord(created);
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        const afterRace = await this.findSubmissionIntentById(intent.submissionId);
        if (afterRace) {
          if (afterRace.status === 'ABORTED') {
            throw DomainException.conflict(
              ErrorCode.HOLD_EXPIRED,
              'Phiên nộp hồ sơ đội (Submission Intent) đã bị hủy hoặc quá hạn lease',
            );
          }
          return afterRace;
        }
      }
      throw err;
    }
  }

  /**
   * Mục 7 WF07 & Mục 28 SRS:
   * Tranh quyền nguyên tử giữa Timeout Worker / Abort (PENDING -> ABORTED) và Commit (PENDING -> COMMITTED).
   * Commit và Abort không bao giờ cùng thắng:
   * - Nếu đã COMMITTED: giữ nguyên COMMITTED, trả về aborted = false.
   * - Nếu đang PENDING: chuyển sang ABORTED, trả về aborted = true.
   * - Nếu chưa tồn tại: chèn bản ghi ABORTED để chặn mọi lệnh commit đến trễ có cùng submissionId.
   */
  async abortSubmissionIntent(params: {
    submissionId: string;
    opportunityId?: string;
    teamId?: string;
    leaderId?: string;
    reason?: string;
  }): Promise<SubmissionIntentRecord & { readonly aborted: boolean }> {
    const safeSubmissionId = String(params.submissionId);
    const updatedPending = await this.intentModel
      .findOneAndUpdate(
        {
          submissionId: { $eq: safeSubmissionId },
          status: { $eq: 'PENDING' },
        },
        {
          $set: {
            status: 'ABORTED',
            ...(params.reason ? { reason: params.reason } : {}),
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    if (updatedPending) {
      return Object.freeze({
        ...this.toIntentRecord(updatedPending),
        aborted: true,
      });
    }

    const existing = await this.findSubmissionIntentById(safeSubmissionId);
    if (existing) {
      return Object.freeze({
        ...existing,
        aborted: existing.status === 'ABORTED',
      });
    }

    try {
      const tombstone = await this.intentModel.create({
        submissionId: safeSubmissionId,
        opportunityId: params.opportunityId ?? 'UNKNOWN',
        teamId: params.teamId ?? 'UNKNOWN',
        leaderId: params.leaderId ?? 'SYSTEM',
        status: 'ABORTED',
        reason: params.reason ?? 'LEASE_EXPIRED_ABORT',
        memberIds: [],
      });
      return Object.freeze({
        ...this.toIntentRecord(tombstone),
        aborted: true,
      });
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        const raced = await this.findSubmissionIntentById(safeSubmissionId);
        if (raced) {
          return Object.freeze({
            ...raced,
            aborted: raced.status === 'ABORTED',
          });
        }
      }
      throw err;
    }
  }

  /**
   * Tiêu chí nghiệm thu F22 & F31 (Mục 7 WF07, Mục 12C, Mục 27, 28 SRS):
   * Ghi đồng thời trong cùng 1 transaction:
   * 1. Chuyển submission_intents từ PENDING -> COMMITTED (chặn nếu đã ABORTED)
   * 2. Ghi application_members (isActive: true) cho toàn bộ thành viên đội (chặn nếu trùng thành viên đang active ở đội khác)
   * 3. Ghi Application + ApplicationRevision (kèm memberSnapshots & consentRefs) + ApplicationEvent + Outbox
   */
  async commitSubmissionWithOutbox(params: {
    application: Application;
    isResubmission: boolean;
    revision: ApplicationRevisionRecord;
    event: ApplicationEventRecord;
    outbox: OutboxEventRecord;
    submissionIntent?: SubmissionIntentRecord;
    activeMemberIds?: readonly string[];
  }): Promise<void> {
    const writeOperations = async (session?: ClientSession) => {
      if (params.submissionIntent) {
        await this.claimSubmissionIntentForCommit(
          params.submissionIntent,
          params.application.id,
          session,
        );
      }

      if (params.activeMemberIds && params.activeMemberIds.length > 0) {
        if (params.isResubmission) {
          await this.releaseApplicationMembers(params.application.id, session);
        }
        await this.insertActiveApplicationMembers(
          params.application.opportunityId,
          params.application.id,
          params.activeMemberIds,
          session,
        );
      }

      if (params.isResubmission) {
        await this.update(params.application, session);
      } else {
        await this.save(params.application, session);
      }
      await this.saveRevision(params.revision, session);
      await this.appendEvent(params.event, session);
      await this.outboxModel.create([params.outbox], session ? { session } : undefined);
    };

    await this.runInTransactionWithFallback(writeOperations);
  }

  /**
   * Mục 12C, 27 & 28 SRS: Ghi đồng thời cập nhật trạng thái Rút đơn (WITHDRAWN) + giải phóng application_members + Event + Outbox trong cùng 1 transaction.
   */
  async commitWithdrawalWithOutbox(params: {
    application: Application;
    event: ApplicationEventRecord;
    outbox: OutboxEventRecord;
  }): Promise<void> {
    const writeOperations = async (session?: ClientSession) => {
      await this.update(params.application, session);
      await this.releaseApplicationMembers(params.application.id, session);
      await this.appendEvent(params.event, session);
      await this.outboxModel.create([params.outbox], session ? { session } : undefined);
    };

    await this.runInTransactionWithFallback(writeOperations);
  }

  private async claimSubmissionIntentForCommit(
    intent: SubmissionIntentRecord,
    applicationId: string,
    session?: ClientSession,
  ): Promise<void> {
    const safeSubmissionId = String(intent.submissionId);
    const existing = await this.intentModel
      .findOne(
        { submissionId: { $eq: safeSubmissionId } },
        null,
        session ? { session } : undefined,
      )
      .lean()
      .exec();

    if (existing) {
      if (existing.status === 'ABORTED') {
        throw DomainException.conflict(
          ErrorCode.HOLD_EXPIRED,
          'Phiên nộp hồ sơ đội (Submission Intent) đã bị hủy hoặc quá hạn lease, không thể commit',
        );
      }
      if (existing.status === 'COMMITTED') {
        throw DomainException.conflict(
          ErrorCode.ALREADY_APPLIED,
          'Phiên nộp hồ sơ đội (Submission Intent) này đã được commit trước đó',
        );
      }

      const claimed = await this.intentModel
        .findOneAndUpdate(
          {
            submissionId: { $eq: safeSubmissionId },
            status: { $eq: 'PENDING' },
          },
          {
            $set: {
              status: 'COMMITTED',
              applicationId,
            },
          },
          { new: true, ...(session ? { session } : {}) },
        )
        .lean()
        .exec();

      if (!claimed) {
        throw DomainException.conflict(
          ErrorCode.HOLD_EXPIRED,
          'Không thể khóa nguyên tử Submission Intent do đã bị hủy hoặc thay đổi trạng thái',
        );
      }
      return;
    }

    await this.intentModel.create(
      [
        {
          submissionId: intent.submissionId,
          opportunityId: intent.opportunityId,
          teamId: intent.teamId,
          leaderId: intent.leaderId,
          status: 'COMMITTED',
          applicationId,
          reservationId: intent.reservationId,
          fencingToken: intent.fencingToken,
          rosterVersion: intent.rosterVersion,
          memberIds: [...(intent.memberIds ?? [])],
        },
      ],
      session ? { session } : undefined,
    );
  }

  private async insertActiveApplicationMembers(
    opportunityId: string,
    applicationId: string,
    memberIds: readonly string[],
    session?: ClientSession,
  ): Promise<void> {
    const safeOppId = String(opportunityId);
    const safeStudents = memberIds.map((m) => String(m));

    const activeConflicts = await this.memberModel
      .find(
        {
          opportunityId: { $eq: safeOppId },
          studentId: { $in: safeStudents },
          isActive: { $eq: true },
          applicationId: { $ne: String(applicationId) },
        },
        null,
        session ? { session } : undefined,
      )
      .lean()
      .exec();

    if (activeConflicts.length > 0) {
      const conflictedIds = activeConflicts.map((c) => c.studentId).join(', ');
      throw DomainException.conflict(
        ErrorCode.ALREADY_APPLIED,
        `Thành viên (${conflictedIds}) đang thuộc một hồ sơ đội khác còn hiệu lực của cuộc thi này`,
      );
    }

    const docs = safeStudents.map((studentId) => ({
      id: `am_${crypto.randomUUID()}`,
      opportunityId: safeOppId,
      applicationId: String(applicationId),
      studentId,
      isActive: true,
    }));

    try {
      await this.memberModel.create(docs, session ? { session } : undefined);
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        throw DomainException.conflict(
          ErrorCode.ALREADY_APPLIED,
          'Hai đội không được dùng chung thành viên đang có hồ sơ còn hiệu lực (application_members unique)',
        );
      }
      throw err;
    }
  }

  private async runInTransactionWithFallback(
    work: (session?: ClientSession) => Promise<void>,
  ): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await work(session);
      });
    } catch (err: unknown) {
      if (err instanceof DomainException) {
        throw err;
      }
      if (isDuplicateKeyError(err)) {
        throw DomainException.conflict(
          ErrorCode.ALREADY_APPLIED,
          'Bạn hoặc thành viên trong đội đã có hồ sơ còn hiệu lực cho cơ hội này (Unique constraint)',
        );
      }
      if (isTransactionUnsupportedError(err)) {
        await work(undefined);
        return;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  private toIntentRecord(doc: {
    submissionId: string;
    opportunityId: string;
    teamId: string;
    leaderId: string;
    status: string;
    applicationId?: string;
    reservationId?: string;
    fencingToken?: number;
    rosterVersion?: number;
    memberIds?: string[];
    reason?: string;
  }): SubmissionIntentRecord {
    return Object.freeze({
      submissionId: doc.submissionId,
      opportunityId: doc.opportunityId,
      teamId: doc.teamId,
      leaderId: doc.leaderId,
      status: doc.status as SubmissionIntentStatus,
      applicationId: doc.applicationId,
      reservationId: doc.reservationId,
      fencingToken: doc.fencingToken,
      rosterVersion: doc.rosterVersion,
      memberIds: Object.freeze([...(doc.memberIds ?? [])]),
      reason: doc.reason,
    });
  }

  private toDomain(doc: {
    id: string;
    opportunityId: string;
    studentId: string;
    teamId?: string;
    submissionId?: string;
    rosterVersion?: number;
    reservationId?: string;
    fencingToken?: number;
    memberIds?: string[];
    submissionType: string;
    status: string;
    screening?: string;
    screeningReasons?: Record<string, unknown>[];
    previewId: string;
    snapshotId: string;
    profileVersion: number;
    ruleVersion?: number;
    payloadHash: string;
    consentId: string;
    submittedAt: Date;
    revision: number;
    version: number;
  }): Application {
    return new Application(doc.id, {
      opportunityId: doc.opportunityId,
      studentId: doc.studentId,
      teamId: doc.teamId,
      submissionId: doc.submissionId,
      rosterVersion: doc.rosterVersion,
      reservationId: doc.reservationId,
      fencingToken: doc.fencingToken,
      memberIds: Object.freeze([...(doc.memberIds ?? [])]),
      submissionType: doc.submissionType as 'INDIVIDUAL' | 'TEAM',
      status: doc.status as ApplicationStatus,
      screening: (doc.screening as ScreeningStatus) ?? 'ELIGIBLE',
      screeningReasons: ((doc.screeningReasons ?? []) as unknown as ScreeningReason[]).map((r) =>
        Object.freeze({ ...r }),
      ),
      previewId: doc.previewId,
      snapshotId: doc.snapshotId,
      profileVersion: doc.profileVersion,
      ruleVersion: doc.ruleVersion ?? 1,
      payloadHash: doc.payloadHash,
      consentId: doc.consentId,
      submittedAt: new Date(doc.submittedAt),
      revision: doc.revision,
      version: doc.version,
    });
  }
}
