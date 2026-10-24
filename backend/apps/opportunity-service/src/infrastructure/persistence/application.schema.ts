import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SubmissionPreviewDocument = SubmissionPreviewModel & Document;
export type ApplicationDocument = ApplicationModel & Document;
export type ApplicationRevisionDocument = ApplicationRevisionModel & Document;
export type ApplicationEventDocument = ApplicationEventModel & Document;
export type ApplicationMemberDocument = ApplicationMemberModel & Document;
export type SubmissionIntentDocument = SubmissionIntentModel & Document;

/**
 * Mục 26 & 27 SRS: Collection submission_previews
 * Lưu bản chụp bất biến (TTL 10 phút chỉ dọn preview hết hạn chưa nộp)
 */
@Schema({ collection: 'submission_previews', timestamps: true })
export class SubmissionPreviewModel {
  @Prop({ required: true, unique: true, index: true })
  previewId: string;

  @Prop({ required: true, index: true })
  actorId: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true })
  submissionId: string;

  @Prop({ required: true })
  snapshotId: string;

  @Prop({ required: true })
  profileVersion: number;

  @Prop({ required: true })
  ruleVersion: number;

  @Prop({ required: true })
  snapshotJson: string;

  @Prop({ required: true })
  manifestJson: string;

  @Prop({ required: true })
  manifestHash: string;

  @Prop({ required: true })
  payloadHash: string;

  @Prop({ required: true, enum: ['ELIGIBLE', 'INELIGIBLE', 'NEEDS_REVIEW'], default: 'ELIGIBLE' })
  screening: string;

  @Prop({ required: true, index: { expires: 0 } })
  expiresAt: Date;
}

export const SubmissionPreviewSchema = SchemaFactory.createForClass(SubmissionPreviewModel);

/**
 * Mục 17 & 27 SRS: Collection applications
 * Unique (opportunityId, subjectType, subjectId)
 */
@Schema({ collection: 'applications', timestamps: true })
export class ApplicationModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true, enum: ['STUDENT', 'TEAM'], default: 'STUDENT' })
  subjectType: string;

  @Prop({ required: true, index: true })
  subjectId: string;

  @Prop({ required: true, index: true })
  studentId: string;

  @Prop({ index: true })
  teamId?: string;

  @Prop({ required: true, enum: ['INDIVIDUAL', 'TEAM'], default: 'INDIVIDUAL' })
  submissionType: string;

  @Prop({ required: true, default: 'SUBMITTED', index: true })
  status: string;

  @Prop({ required: true, enum: ['ELIGIBLE', 'INELIGIBLE', 'NEEDS_REVIEW'], default: 'ELIGIBLE' })
  screening: string;

  @Prop({ required: true })
  previewId: string;

  @Prop({ required: true })
  snapshotId: string;

  @Prop({ required: true })
  profileVersion: number;

  @Prop({ required: true, default: 1 })
  ruleVersion: number;

  @Prop({ required: true })
  payloadHash: string;

  @Prop({ required: true })
  consentId: string;

  @Prop({ required: true })
  submittedAt: Date;

  @Prop({ default: 1 })
  revision: number;

  @Prop({ default: 1 })
  version: number;
}

export const ApplicationSchema = SchemaFactory.createForClass(ApplicationModel);
ApplicationSchema.index({ opportunityId: 1, subjectType: 1, subjectId: 1 }, { unique: true });

/**
 * Mục 26 & 27 SRS: Collection application_revisions
 * Lưu vĩnh viễn bản sao bất biến của snapshot và consent refs theo từng lần nộp (KHÔNG đặt TTL)
 */
@Schema({ collection: 'application_revisions', timestamps: true })
export class ApplicationRevisionModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  applicationId: string;

  @Prop({ required: true })
  revision: number;

  @Prop({ required: true })
  previewId: string;

  @Prop({ required: true })
  snapshotId: string;

  @Prop({ required: true })
  profileVersion: number;

  @Prop({ required: true })
  ruleVersion: number;

  @Prop({ required: true })
  snapshotJson: string;

  @Prop({ required: true })
  manifestJson: string;

  @Prop({ required: true })
  payloadHash: string;

  @Prop({ required: true })
  consentId: string;

  @Prop({ required: true, enum: ['ELIGIBLE', 'INELIGIBLE', 'NEEDS_REVIEW'], default: 'ELIGIBLE' })
  screening: string;

  @Prop({ required: true })
  submittedAt: Date;
}

export const ApplicationRevisionSchema = SchemaFactory.createForClass(ApplicationRevisionModel);
ApplicationRevisionSchema.index({ applicationId: 1, revision: 1 }, { unique: true });

/**
 * Mục 17 & 27 SRS: Collection application_events (Timeline & Audit lịch sử chuyển trạng thái)
 */
@Schema({ collection: 'application_events', timestamps: true })
export class ApplicationEventModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  applicationId: string;

  @Prop({ required: true })
  actorId: string;

  @Prop()
  fromStatus?: string;

  @Prop({ required: true })
  toStatus: string;

  @Prop({ required: true })
  revision: number;

  @Prop()
  reason?: string;
}

export const ApplicationEventSchema = SchemaFactory.createForClass(ApplicationEventModel);
ApplicationEventSchema.index({ applicationId: 1, createdAt: -1 });

/**
 * Mục 12C & 27 SRS: Collection application_members
 * Unique (opportunityId, studentId) khi hồ sơ đội còn hiệu lực (isActive = true)
 */
@Schema({ collection: 'application_members', timestamps: true })
export class ApplicationMemberModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true, index: true })
  applicationId: string;

  @Prop({ required: true, index: true })
  studentId: string;

  @Prop({ required: true, default: true, index: true })
  isActive: boolean;
}

export const ApplicationMemberSchema = SchemaFactory.createForClass(ApplicationMemberModel);
ApplicationMemberSchema.index(
  { opportunityId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

/**
 * Mục 7 WF07 & 27 SRS: Collection submission_intents
 * Tranh quyền nguyên tử giữa Commit (COMMITTED) và Timeout Worker (ABORTED)
 */
@Schema({ collection: 'submission_intents', timestamps: true })
export class SubmissionIntentModel {
  @Prop({ required: true, unique: true, index: true })
  submissionId: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true })
  leaderId: string;

  @Prop({ required: true, enum: ['PENDING', 'COMMITTED', 'ABORTED'], default: 'PENDING', index: true })
  status: string;

  @Prop()
  applicationId?: string;
}

export const SubmissionIntentSchema = SchemaFactory.createForClass(SubmissionIntentModel);
