import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  IApplicationRepository,
  SubmissionPreviewRecord,
  ApplicationRevisionRecord,
} from '../../domain/ports/application.repository.port';
import { Application, ApplicationStatus, ScreeningStatus } from '../../domain/application.entity';
import {
  ApplicationModel,
  ApplicationDocument,
  SubmissionPreviewModel,
  SubmissionPreviewDocument,
  ApplicationRevisionModel,
  ApplicationRevisionDocument,
  ApplicationEventModel,
  ApplicationEventDocument,
  SubmissionIntentModel,
  SubmissionIntentDocument,
} from './application.schema';

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
    @InjectModel(SubmissionIntentModel.name)
    private readonly intentModel: Model<SubmissionIntentDocument>,
  ) {}

  async findById(id: string): Promise<Application | null> {
    const doc = await this.model.findOne({ id: String(id) }).lean().exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByOpportunityAndStudent(
    opportunityId: string,
    studentId: string,
  ): Promise<Application | null> {
    const doc = await this.model
      .findOne({
        opportunityId: String(opportunityId),
        studentId: String(studentId),
      })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findManyByStudent(studentId: string): Promise<Application[]> {
    const docs = await this.model
      .find({ studentId: String(studentId) })
      .sort({ submittedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findManyByOpportunity(opportunityId: string): Promise<Application[]> {
    const docs = await this.model
      .find({ opportunityId: String(opportunityId) })
      .sort({ submittedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findApplicationByTeamId(teamId: string): Promise<Application | null> {
    const doc = await this.model
      .findOne({
        teamId: String(teamId),
        status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'] },
      })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async save(application: Application): Promise<void> {
    const subjectType = application.props.submissionType === 'TEAM' ? 'TEAM' : 'STUDENT';
    const subjectId =
      subjectType === 'TEAM' && application.props.teamId
        ? application.props.teamId
        : application.studentId;

    await this.model.create({
      id: application.id,
      opportunityId: application.opportunityId,
      subjectType,
      subjectId,
      studentId: application.studentId,
      teamId: application.props.teamId,
      submissionType: application.props.submissionType,
      status: application.status,
      screening: application.screening,
      previewId: application.props.previewId,
      snapshotId: application.props.snapshotId,
      profileVersion: application.props.profileVersion,
      ruleVersion: application.props.ruleVersion ?? 1,
      payloadHash: application.props.payloadHash,
      consentId: application.props.consentId,
      submittedAt: application.props.submittedAt,
      revision: application.revision,
      version: application.version,
    });
  }

  async update(application: Application): Promise<void> {
    await this.model
      .updateOne(
        { id: String(application.id) },
        {
          $set: {
            status: application.status,
            screening: application.screening,
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
      )
      .exec();
  }

  async savePreview(preview: SubmissionPreviewRecord): Promise<void> {
    await this.previewModel.create({ ...preview });
  }

  async findPreviewById(previewId: string): Promise<SubmissionPreviewRecord | null> {
    const doc = await this.previewModel.findOne({ previewId: String(previewId) }).lean().exec();
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
      expiresAt: new Date(doc.expiresAt),
    });
  }

  async saveRevision(revision: ApplicationRevisionRecord): Promise<void> {
    await this.revisionModel.create({ ...revision });
  }

  async findLatestRevision(applicationId: string): Promise<ApplicationRevisionRecord | null> {
    const doc = await this.revisionModel
      .findOne({ applicationId: String(applicationId) })
      .sort({ revision: -1 })
      .lean()
      .exec();
    if (!doc) return null;
    return Object.freeze({
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
      screening: doc.screening as any,
      submittedAt: new Date(doc.submittedAt),
    });
  }

  async appendEvent(event: {
    id: string;
    applicationId: string;
    actorId: string;
    fromStatus?: string;
    toStatus: string;
    revision: number;
    reason?: string;
  }): Promise<void> {
    await this.eventModel.create({ ...event });
  }

  async findEventsByApplication(applicationId: string): Promise<any[]> {
    const docs = await this.eventModel
      .find({ applicationId: String(applicationId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((d: any) => ({
      id: d.id,
      applicationId: d.applicationId,
      actorId: d.actorId,
      fromStatus: d.fromStatus,
      toStatus: d.toStatus,
      revision: d.revision,
      reason: d.reason,
      createdAt: d.createdAt,
    }));
  }

  async findSubmissionIntent(teamId: string, submissionId: string): Promise<{ status: string } | null> {
    const doc = await this.intentModel
      .findOne({
        teamId: String(teamId),
        submissionId: String(submissionId),
      })
      .lean()
      .exec();
    if (!doc) return null;
    return { status: doc.status };
  }

  async upsertSubmissionIntent(intent: {
    submissionId: string;
    opportunityId: string;
    teamId: string;
    leaderId: string;
    status: string;
    applicationId?: string;
  }): Promise<void> {
    await this.intentModel
      .findOneAndUpdate(
        { submissionId: intent.submissionId },
        {
          $set: {
            opportunityId: intent.opportunityId,
            teamId: intent.teamId,
            leaderId: intent.leaderId,
            status: intent.status,
            applicationId: intent.applicationId,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
  }

  private toDomain(doc: {
    id: string;
    opportunityId: string;
    studentId: string;
    teamId?: string;
    submissionType: string;
    status: string;
    screening?: string;
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
