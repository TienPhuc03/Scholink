import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
import {
  OpportunityType,
  OpportunityStatus,
  ApplyMode,
  FundingLevel,
} from "../../domain/opportunity.entity";

export type OpportunityDocument = OpportunityModel & Document;

@Schema({ collection: "opportunities", timestamps: true })
export class OpportunityModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, enum: ["SCHOLARSHIP", "COMPETITION"], index: true })
  type: string;

  @Prop({ required: true, index: true })
  title: string;

  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  benefits?: string;

  @Prop()
  requirements?: string;

  @Prop({ index: true })
  organizationId?: string;

  @Prop({ required: true })
  organizerName: string;

  //applyMode là external
  @Prop()
  sourceUrl?: string;

  @Prop({ required: true, enum: ["IN_APP", "EXTERNAL"], default: "IN_APP" })
  applyMode: ApplyMode;

  @Prop({
    required: true,
    enum: ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "CLOSED", "CANCELLED"],
    default: "DRAFT",
    index: true,
  })
  status: OpportunityStatus;

  @Prop({ required: true, index: true })
  registerDeadline: Date;

  @Prop()
  submitDeadline?: Date;

  @Prop({ required: true, default: "Asia/Ho_Chi_Minh" })
  timezone: string;

  //bộ lọc catalog + UI card
  @Prop({ enum: ["FULL", "PARTIAL", "OTHER", "FREE_ENTRY"] })
  fundingLevel?: FundingLevel;

  @Prop({ default: 0.0 })
  minGpa: number;

  @Prop({ default: 0.0 })
  requiredIelts: number;

  @Prop()
  coverImageUrl?: string;

  @Prop({ default: false, index: true })
  isPromoted: boolean;

  //cuộc thi
  @Prop({ enum: ["INDIVIDUAL", "TEAM"] })
  competitionMode?: "INDIVIDUAL" | "TEAM";

  @Prop()
  minTeamSize?: number;

  @Prop()
  maxTeamSize?: number;

  @Prop({ type: [Object], default: [] })
  eligibilityRules?: Record<string, any>[];

  @Prop({ type: [String], default: [] })
  tags?: string[];

  @Prop({ default: 1 })
  version: number;
}

export const OpportunitySchema = SchemaFactory.createForClass(OpportunityModel);
OpportunitySchema.index({ type: 1, status: 1, registerDeadline: 1 });
OpportunitySchema.index({ isPromoted: -1, createdAt: -1 });
