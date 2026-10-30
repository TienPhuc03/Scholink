import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TeamDocument = TeamModel & Document;
export type ActiveMembershipDocument = ActiveMembershipModel & Document;
export type JoinRequestDocument = JoinRequestModel & Document;
export type SubmissionReservationDocument = SubmissionReservationModel & Document;

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
  rosterVersion: number;

  @Prop({ default: 0 })
  fencingToken: number;

  @Prop()
  currentReservationId?: string;

  @Prop({ default: 1 })
  version: number;
}

export const TeamSchema = SchemaFactory.createForClass(TeamModel);
TeamSchema.index({ competitionId: 1, status: 1 });

@Schema({ collection: 'active_memberships', timestamps: true })
export class ActiveMembershipModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  studentId: string;

  @Prop({ required: true, index: true })
  competitionId: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true, default: 'MEMBER' })
  role: string;

  @Prop({ default: Date.now })
  joinedAt: Date;
}

export const ActiveMembershipSchema = SchemaFactory.createForClass(ActiveMembershipModel);
// Guarantee a student can belong to at most one team in a competition
ActiveMembershipSchema.index({ competitionId: 1, studentId: 1 }, { unique: true });

@Schema({ collection: 'join_requests', timestamps: true })
export class JoinRequestModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true, index: true })
  competitionId: string;

  @Prop({ required: true, index: true })
  applicantId: string;

  @Prop()
  message?: string;

  @Prop({ required: true, default: 'PENDING', index: true })
  status: string;

  @Prop({ default: Date.now })
  appliedAt: Date;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  reviewedBy?: string;
}

export const JoinRequestSchema = SchemaFactory.createForClass(JoinRequestModel);
JoinRequestSchema.index({ teamId: 1, applicantId: 1 });

@Schema({ collection: 'submission_reservations', timestamps: true })
export class SubmissionReservationModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true, index: true })
  competitionId: string;

  @Prop({ required: true })
  fencingToken: number;

  @Prop({ required: true })
  rosterVersion: number;

  @Prop({ type: [String], required: true })
  members: string[];

  @Prop({ required: true })
  leaseExpiresAt: Date;

  @Prop({ required: true, default: 'PENDING', index: true })
  status: string;

  @Prop({ type: [Object], default: [] })
  consents: Record<string, any>[];
}

export const SubmissionReservationSchema = SchemaFactory.createForClass(SubmissionReservationModel);
SubmissionReservationSchema.index({ teamId: 1, status: 1 });
SubmissionReservationSchema.index({ leaseExpiresAt: 1, status: 1 });
