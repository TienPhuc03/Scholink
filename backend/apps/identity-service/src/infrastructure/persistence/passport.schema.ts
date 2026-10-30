import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PassportDocument = PassportModel & Document;
export type MediaAssetDocument = MediaAssetModel & Document;
export type ConsentDocument = ConsentModel & Document;

/**
 * Mục 10, 14 & 27 SRS: Collection passports (unique studentId, version)
 */
@Schema({ collection: 'passports', timestamps: true })
export class PassportModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, unique: true, index: true })
  studentId: string;

  @Prop({ required: true })
  fullName: string;

  @Prop()
  bio?: string;

  @Prop()
  avatarAssetId?: string;

  @Prop()
  regionCode?: string;

  @Prop({ type: Object })
  education?: Record<string, unknown>;

  @Prop({ type: [Object], default: [] })
  certificates?: Record<string, unknown>[];

  @Prop({ type: [String], default: [] })
  skills?: string[];

  @Prop({ type: [String], default: [] })
  achievements?: string[];

  @Prop({ type: Object })
  availability?: Record<string, unknown>;

  @Prop({ type: Object, default: { email: 'PRIVATE', phone: 'PRIVATE' } })
  fieldPrivacy?: Record<string, string>;

  @Prop()
  cvAssetId?: string;

  @Prop()
  pitchVideoAssetId?: string;

  @Prop({ default: false, index: true })
  isLookingForTeammate: boolean;

  @Prop({ default: false, index: true })
  isOpenForScholarship: boolean;

  @Prop({ default: false })
  isOpenForMentoring: boolean;

  @Prop({ default: 0 })
  completionScore: number;

  @Prop({ default: 1 })
  scoreVersion: number;

  @Prop({ default: 1 })
  version: number;
}

export const PassportSchema = SchemaFactory.createForClass(PassportModel);

/**
 * Mục 10, 27 & 29 SRS: Collection media_assets (UPLOADING -> SCANNING -> READY | REJECTED)
 */
@Schema({ collection: 'media_assets', timestamps: true })
export class MediaAssetModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  ownerId: string;

  @Prop({
    required: true,
    enum: ['AVATAR', 'CV', 'CERTIFICATE', 'ACHIEVEMENT', 'PITCH_VIDEO', 'ATTACHMENT'],
  })
  category: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  sizeBytes: number;

  @Prop({ required: true })
  sha256: string;

  @Prop({ required: true, unique: true })
  objectKey: string;

  @Prop({
    required: true,
    enum: ['UPLOADING', 'SCANNING', 'READY', 'REJECTED'],
    default: 'UPLOADING',
    index: true,
  })
  status: string;

  @Prop({ default: 1 })
  version: number;
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAssetModel);
MediaAssetSchema.index({ ownerId: 1, status: 1 });

/**
 * Mục 26 & 27 SRS: Collection consents
 * Lưu previewId, snapshotId, profileVersion, ruleVersion, manifestHash, payloadHash (SHA-256 RFC 8785) và expiresAt
 */
@Schema({ collection: 'consents', timestamps: true })
export class ConsentModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  actorId: string;

  @Prop({
    required: true,
    enum: ['APPLICATION_SUBMISSION', 'PROFILE_SHARING'],
    default: 'APPLICATION_SUBMISSION',
  })
  purpose: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop()
  submissionId?: string;

  @Prop({ required: true, index: true })
  previewId: string;

  @Prop({ required: true })
  snapshotId: string;

  @Prop({ required: true })
  profileVersion: number;

  @Prop({ required: true })
  ruleVersion: number;

  @Prop({ required: true })
  manifestHash: string;

  @Prop({ required: true })
  payloadHash: string;

  @Prop({ type: [String], default: ['SNAPSHOT', 'ATTACHMENTS'] })
  scope: string[];

  @Prop({ required: true, index: { expires: 0 } })
  expiresAt: Date;
}

export const ConsentSchema = SchemaFactory.createForClass(ConsentModel);
ConsentSchema.index({ actorId: 1, purpose: 1, profileVersion: 1, opportunityId: 1 });
