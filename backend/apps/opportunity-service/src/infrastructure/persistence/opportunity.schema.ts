import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  OpportunityType,
  OpportunityStatus,
  ApplyMode,
  FundingLevel,
} from '../../domain/opportunity.entity';

export type OpportunityDocument = OpportunityModel & Document;
export type OpportunityRevisionDocument = OpportunityRevisionModel & Document;
export type BookmarkDocument = BookmarkModel & Document;
export type ExternalRegistrationDocument = ExternalRegistrationModel & Document;
export type CrawlerSourceDocument = CrawlerSourceModel & Document;
export type CrawlerAlertDocument = CrawlerAlertModel & Document;

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
  type: OpportunityType;

  @Prop({ required: true, index: true })
  title: string;

  @Prop({ sparse: true, index: true })
  slug?: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  benefits?: string;

  @Prop()
  requirements?: string;

  @Prop({ index: true })
  organizationId?: string;

  @Prop()
  createdBy?: string;

  @Prop({ required: true })
  organizerName: string;

  @Prop()
  sourceUrl?: string;

  @Prop({ required: true, enum: ['IN_APP', 'EXTERNAL'], default: 'IN_APP', index: true })
  applyMode: ApplyMode;

  @Prop({
    required: true,
    enum: ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'CLOSED', 'CANCELLED'],
    default: 'PUBLISHED',
    index: true,
  })
  status: OpportunityStatus;

  @Prop({ required: true, index: true })
  registerDeadline: Date;

  @Prop()
  submitDeadline?: Date;

  @Prop({ required: true, default: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  @Prop({ enum: ['FULL', 'PARTIAL', 'OTHER', 'FREE_ENTRY'] })
  fundingLevel?: FundingLevel;

  @Prop({ default: 0.0 })
  minGpa: number;

  @Prop({ default: 0.0 })
  requiredIelts: number;

  @Prop()
  coverImageUrl?: string;

  @Prop({ default: false, index: true })
  isPromoted: boolean;

  @Prop({ enum: ['INDIVIDUAL', 'TEAM'] })
  competitionMode?: 'INDIVIDUAL' | 'TEAM';

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

  @Prop({ type: Object })
  rawPayload?: Record<string, unknown>;

  @Prop()
  confidenceScore?: number;

  @Prop({ type: Object })
  confidenceBreakdown?: Record<string, number>;

  @Prop()
  reviewReason?: string;

  @Prop({ type: [String], default: [] })
  candidateMergeIds?: string[];

  @Prop()
  reviewedBy?: string;

  @Prop()
  reviewedAt?: Date;
}

export const OpportunitySchema = SchemaFactory.createForClass(OpportunityModel);
OpportunitySchema.index({ type: 1, status: 1, registerDeadline: 1 });
OpportunitySchema.index({ isPromoted: -1, createdAt: -1 });

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

  @Prop({ required: true, enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXTENDED', 'CANCELLED'], default: 'PENDING_REVIEW' })
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

export type CrawlerSourceStatus = 'HEALTHY' | 'DEGRADED' | 'PAUSED';

/**
 * CRAWL-08 & Mục 12B/27 SRS: Collection crawler_sources
 * Quản lý nguồn crawl, cấu hình retry, trạng thái và thống kê số lấy/loại/gộp/công bố/lỗi
 */
@Schema({ collection: 'crawler_sources', timestamps: true })
export class CrawlerSourceModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true, enum: ['SCHOLARSHIP', 'COMPETITION'], index: true })
  type: OpportunityType;

  @Prop({ default: 0.8 })
  trustLevel: number;

  @Prop({ default: 'Asia/Ho_Chi_Minh' })
  defaultTimezone: string;

  @Prop({ required: true, enum: ['HEALTHY', 'DEGRADED', 'PAUSED'], default: 'HEALTHY', index: true })
  status: CrawlerSourceStatus;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop({ default: 3 })
  maxRetries: number;

  @Prop()
  lastRunAt?: Date;

  @Prop()
  lastSuccessAt?: Date;

  @Prop()
  lastError?: string;

  // CRAWL-08: theo dõi số lấy/loại/gộp/công bố/lỗi
  @Prop({ default: 0 })
  totalFetched: number;

  @Prop({ default: 0 })
  totalRejected: number;

  @Prop({ default: 0 })
  totalMerged: number;

  @Prop({ default: 0 })
  totalPublished: number;

  @Prop({ default: 0 })
  totalErrors: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const CrawlerSourceSchema = SchemaFactory.createForClass(CrawlerSourceModel);

/**
 * CRAWL-08: Collection crawler_alerts
 * Lưu trữ nhật ký cảnh báo và cảnh báo nguồn DEGRADED
 */
@Schema({ collection: 'crawler_alerts', timestamps: true })
export class CrawlerAlertModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  sourceId: string;

  @Prop({ required: true })
  sourceName: string;

  @Prop({ required: true, enum: ['WARNING', 'CRITICAL', 'INFO'], index: true })
  severity: 'WARNING' | 'CRITICAL' | 'INFO';

  @Prop({ required: true })
  message: string;

  @Prop({ default: 1 })
  retryAttempt: number;

  @Prop({ default: () => new Date() })
  timestamp: Date;
}

export const CrawlerAlertSchema = SchemaFactory.createForClass(CrawlerAlertModel);
