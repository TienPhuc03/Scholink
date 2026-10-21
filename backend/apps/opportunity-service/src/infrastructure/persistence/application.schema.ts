import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ApplicationDocument = ApplicationModel & Document;

@Schema({ collection: 'applications', timestamps: true })
export class ApplicationModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true, index: true })
  studentId: string;

  @Prop({ index: true })
  teamId?: string;

  @Prop({ required: true, enum: ['INDIVIDUAL', 'TEAM'], default: 'INDIVIDUAL' })
  submissionType: string;

  @Prop({ required: true, default: 'SUBMITTED', index: true })
  status: string;

  @Prop({ required: true })
  previewId: string;

  @Prop({ required: true })
  snapshotId: string;

  @Prop({ required: true })
  profileVersion: number;

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
ApplicationSchema.index({ opportunityId: 1, studentId: 1 }, { unique: true });
