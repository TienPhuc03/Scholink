import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PassportDocument = PassportModel & Document;

@Schema({ collection: 'passports', timestamps: true })
export class PassportModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, unique: true, index: true })
  studentId: string;

  @Prop({ required: true })
  fullName: string;

  @Prop()
  bio?: string;

  @Prop()
  avatarAssetId?: string;

  @Prop({ type: Object })
  education?: Record<string, any>;

  @Prop({ type: [Object], default: [] })
  certificates?: Record<string, any>[];

  @Prop({ type: [String], default: [] })
  skills?: string[];

  @Prop({ type: [String], default: [] })
  achievements?: string[];

  @Prop()
  cvAssetId?: string;

  @Prop()
  pitchVideoAssetId?: string;

  @Prop({ default: false })
  isLookingForTeammate: boolean;

  @Prop({ default: false })
  isOpenForScholarship: boolean;

  @Prop({ default: false })
  isOpenForMentoring: boolean;

  @Prop({ default: 0 })
  completionScore: number;

  @Prop({ default: 1 })
  version: number;
}

export const PassportSchema = SchemaFactory.createForClass(PassportModel);
