import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TeamDocument = TeamModel & Document;

@Schema({ collection: 'teams', timestamps: true })
export class TeamModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  competitionId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true, index: true })
  leaderId: string;

  @Prop({ default: 2 })
  minSize: number;

  @Prop({ default: 5 })
  maxSize: number;

  @Prop({ required: true, default: 'FORMING', index: true })
  status: string;

  @Prop({ type: [Object], default: [] })
  members: Record<string, any>[];

  @Prop({ default: 1 })
  version: number;
}

export const TeamSchema = SchemaFactory.createForClass(TeamModel);
TeamSchema.index({ competitionId: 1, status: 1 });
