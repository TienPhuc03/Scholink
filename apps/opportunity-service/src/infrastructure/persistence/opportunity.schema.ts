import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OpportunityDocument = OpportunityModel & Document;
export type OpportunityRevisionDocument = OpportunityRevisionModel & Document;
export type BookmarkDocument = BookmarkModel & Document;
export type ExternalRegistrationDocument = ExternalRegistrationModel & Document;

/**
 * Mục 10, 15 & 27 SRS: Collection opportunities (unique dedupKey)
 */
@Schema({ collection: 'opportunities', timestamps: true })
export class OpportunityModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ unique: true, sparse: true })
  dedupKey?: string;

  @Prop({ required: true, enum: ['SCHOLARSHIP', 'COMPETITION'], index: true })
  type: string;

  @Prop({ required: true, index: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ index: true })
  organizationId?: string;

  @Prop()
  createdBy?: string;

  @Prop({ required: true })
  organizerName: string;

  @Prop()
  sourceUrl?: string;

  @Prop({ required: true, enum: ['IN_APP', 'EXTERNAL'], default: 'IN_APP', index: true })
  applyMode: string;

  @Prop({
    required: true,
    enum: ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'CLOSED', 'CANCELLED'],
    default: 'PUBLISHED',
    index: true,
  })
  status: string;

  @Prop({ required: true, index: true })
  registerDeadline: Date;

  @Prop()
  submitDeadline?: Date;

  @Prop({ default: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  @Prop({ enum: ['FULL', 'PARTIAL', 'OTHER'] })
  fundingLevel?: string;

  @Prop({ enum: ['INDIVIDUAL', 'TEAM'] })
  competitionMode?: string;

  @Prop()
  minTeamSize?: number;

  @Prop()
  maxTeamSize?: number;

  @Prop({ type: [Object], default: [] })
  eligibilityRules?: Record<string, unknown>[];

  @Prop({ type: [String], default: [] })
  requiredFields?: string[];

  @Prop({ type: [String], default: [] })
  tags?: string[];

  @Prop({ default: 1 })
  ruleVersion: number;

  @Prop({ default: 1 })
  version: number;
}

export const OpportunitySchema = SchemaFactory.createForClass(OpportunityModel);
OpportunitySchema.index({ type: 1, status: 1, registerDeadline: 1 });

/**
 * Mục 11 & 27 SRS: Collection opportunity_revisions (unique opportunityId/version)
 */
@Schema({ collection: 'opportunity_revisions', timestamps: true })
export class OpportunityRevisionModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true })
  version: number;

  @Prop({ type: Object, required: true })
  snapshot: Record<string, unknown>;

  @Prop({ required: true, enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED'], default: 'PENDING_REVIEW' })
  status: string;

  @Prop()
  reviewedBy?: string;

  @Prop()
  reason?: string;
}

export const OpportunityRevisionSchema = SchemaFactory.createForClass(OpportunityRevisionModel);
OpportunityRevisionSchema.index({ opportunityId: 1, version: 1 }, { unique: true });

/**
 * Mục 15 & 27 SRS: Collection bookmarks (unique userId/opportunityId)
 */
@Schema({ collection: 'bookmarks', timestamps: true })
export class BookmarkModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  opportunityId: string;
}

export const BookmarkSchema = SchemaFactory.createForClass(BookmarkModel);
BookmarkSchema.index({ userId: 1, opportunityId: 1 }, { unique: true });

/**
 * Mục 6 WF05 & 27 SRS: Collection external_registrations (unique userId/opportunityId)
 */
@Schema({ collection: 'external_registrations', timestamps: true })
export class ExternalRegistrationModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true, enum: ['EXTERNAL_MARKED', 'REMOVED'], default: 'EXTERNAL_MARKED' })
  status: string;
}

export const ExternalRegistrationSchema = SchemaFactory.createForClass(ExternalRegistrationModel);
ExternalRegistrationSchema.index({ userId: 1, opportunityId: 1 }, { unique: true });
