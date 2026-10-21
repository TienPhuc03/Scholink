import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IApplicationRepository } from '../../domain/ports/application.repository.port';
import { Application, ApplicationStatus } from '../../domain/application.entity';
import { ApplicationModel, ApplicationDocument } from './application.schema';

@Injectable()
export class MongooseApplicationRepository implements IApplicationRepository {
  constructor(
    @InjectModel(ApplicationModel.name)
    private readonly model: Model<ApplicationDocument>,
  ) {}

  async findById(id: string): Promise<Application | null> {
    const doc = await this.model.findOne({ id }).exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByOpportunityAndStudent(
    opportunityId: string,
    studentId: string,
  ): Promise<Application | null> {
    const doc = await this.model.findOne({ opportunityId, studentId }).exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findManyByStudent(studentId: string): Promise<Application[]> {
    const docs = await this.model.find({ studentId }).sort({ submittedAt: -1 }).exec();
    return docs.map((d) => this.toDomain(d));
  }

  async findManyByOpportunity(opportunityId: string): Promise<Application[]> {
    const docs = await this.model.find({ opportunityId }).sort({ submittedAt: -1 }).exec();
    return docs.map((d) => this.toDomain(d));
  }

  async save(application: Application): Promise<void> {
    await this.model.create({
      id: application.id,
      opportunityId: application.opportunityId,
      studentId: application.studentId,
      teamId: application.props.teamId,
      submissionType: application.props.submissionType,
      status: application.status,
      previewId: application.props.previewId,
      snapshotId: application.props.snapshotId,
      profileVersion: application.props.profileVersion,
      payloadHash: application.props.payloadHash,
      consentId: application.props.consentId,
      submittedAt: application.props.submittedAt,
      revision: application.props.revision,
      version: application.version,
    });
  }

  async update(application: Application): Promise<void> {
    await this.model
      .updateOne(
        { id: application.id },
        {
          status: application.status,
          revision: application.props.revision,
          version: application.version,
        },
      )
      .exec();
  }

  private toDomain(doc: ApplicationDocument): Application {
    return new Application(doc.id, {
      opportunityId: doc.opportunityId,
      studentId: doc.studentId,
      teamId: doc.teamId,
      submissionType: doc.submissionType as any,
      status: doc.status as ApplicationStatus,
      previewId: doc.previewId,
      snapshotId: doc.snapshotId,
      profileVersion: doc.profileVersion,
      payloadHash: doc.payloadHash,
      consentId: doc.consentId,
      submittedAt: doc.submittedAt,
      revision: doc.revision,
      version: doc.version,
    });
  }
}
