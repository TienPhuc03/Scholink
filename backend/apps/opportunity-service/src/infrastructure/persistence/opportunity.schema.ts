import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OpportunityDocument = OpportunityModel & Document;

@Schema({ collection: 'opportunities', timestamps: true })
export class OpportunityModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, enum: ['SCHOLARSHIP', 'COMPETITION'], index: true })
  type: string;

  @Prop({ required: true, index: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ index: true })
  organizationId?: string;

  @Prop({ required: true })
  organizerName: string;

  @Prop()
  sourceUrl?: string;

  @Prop({ required: true, enum: ['IN_APP', 'EXTERNAL'], default: 'IN_APP' })
  applyMode: string;

  @Prop({ required: true, default: 'PUBLISHED', index: true })
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
  eligibilityRules?: Record<string, any>[];

  @Prop({ type: [String], default: [] })
  tags?: string[];

  @Prop({ default: 1 })
  version: number;
}

export const OpportunitySchema = SchemaFactory.createForClass(OpportunityModel);
OpportunitySchema.index({ type: 1, status: 1, registerDeadline: 1 });
