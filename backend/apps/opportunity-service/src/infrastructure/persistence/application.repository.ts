import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
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
        studentId: { $eq: String(studentId) },
      })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findManyByStudent(studentId: string): Promise<Application[]> {
    const docs = await this.model
      .find({ studentId: { $eq: String(studentId) } })
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
          'Bạn đã nộp hồ sơ cho cơ hội này rồi (Unique constraint)',
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
            submittedAt: application.props.submittedAt,
            revision: application.revision,
            version: application.version,
          },
        },
        session ? { session } : undefined,
      )
      .exec();
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

  /**
   * Tiêu chí nghiệm thu F22 & Mục 27, 28 SRS:
   * Ghi đồng thời Application (unique business constraint) + Revision bất biến + Event + Outbox trong cùng 1 transaction.
   */
  async commitSubmissionWithOutbox(params: {
    application: Application;
    isResubmission: boolean;
    revision: ApplicationRevisionRecord;
    event: ApplicationEventRecord;
    outbox: OutboxEventRecord;
  }): Promise<void> {
    const writeOperations = async (session?: ClientSession) => {
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
   * Mục 27 & 28 SRS: Ghi đồng thời cập nhật trạng thái Rút đơn (WITHDRAWN) + Event + Outbox trong cùng 1 transaction.
   */
  async commitWithdrawalWithOutbox(params: {
    application: Application;
    event: ApplicationEventRecord;
    outbox: OutboxEventRecord;
  }): Promise<void> {
    const writeOperations = async (session?: ClientSession) => {
      await this.update(params.application, session);
      await this.appendEvent(params.event, session);
      await this.outboxModel.create([params.outbox], session ? { session } : undefined);
    };

    await this.runInTransactionWithFallback(writeOperations);
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
      if (isDuplicateKeyError(err)) {
        throw DomainException.conflict(
          ErrorCode.ALREADY_APPLIED,
          'Bạn đã nộp hồ sơ cho cơ hội này rồi (Unique constraint)',
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

  private toDomain(doc: {
    id: string;
    opportunityId: string;
    studentId: string;
    teamId?: string;
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
