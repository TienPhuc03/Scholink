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
