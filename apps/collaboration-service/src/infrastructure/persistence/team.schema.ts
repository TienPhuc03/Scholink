import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TeamDocument = TeamModel & Document;
export type TeamRequestDocument = TeamRequestModel & Document;
export type JoinRequestDocument = JoinRequestModel & Document;
export type ActiveMembershipDocument = ActiveMembershipModel & Document;
export type SubmissionReservationDocument = SubmissionReservationModel & Document;

/**
 * Mục 18 & 27 SRS: Collection teams
 */
@Schema({ collection: 'teams', timestamps: true })
export class TeamModel {
  @Prop({ required: true, unique: true, index: true })
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

  @Prop({
    required: true,
    enum: ['FORMING', 'ACTIVE', 'SUBMITTING', 'SUBMITTED', 'CLOSED'],
    default: 'ACTIVE',
    index: true,
  })
  status: string;

  @Prop({ type: [Object], default: [] })
  members: Record<string, unknown>[];

  @Prop({ default: 1 })
  rosterVersion: number;

  @Prop({ default: 0 })
  fencingToken: number;

  @Prop({ default: 1 })
  version: number;
}

export const TeamSchema = SchemaFactory.createForClass(TeamModel);
TeamSchema.index({ competitionId: 1, status: 1 });

/**
 * Mục 18 & 27 SRS: Collection team_requests
 */
@Schema({ collection: 'team_requests', timestamps: true })
export class TeamRequestModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true, enum: ['DRAFT', 'OPEN', 'PAUSED', 'CLOSED', 'EXPIRED', 'CANCELLED'], default: 'OPEN' })
  status: string;

  @Prop({ type: [String], default: [] })
  requiredSkills: string[];

  @Prop({ required: true })
  closesAt: Date;

  @Prop({ default: 1 })
  version: number;
}

export const TeamRequestSchema = SchemaFactory.createForClass(TeamRequestModel);

/**
 * Mục 18 & 27 SRS: Collection join_requests (unique requestId/applicantId khi PENDING)
 */
@Schema({ collection: 'join_requests', timestamps: true })
export class JoinRequestModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  requestId: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true, index: true })
  applicantId: string;

  @Prop({ required: true, enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'], default: 'PENDING' })
  status: string;

  @Prop({ default: 1 })
  version: number;
}

export const JoinRequestSchema = SchemaFactory.createForClass(JoinRequestModel);
JoinRequestSchema.index(
  { requestId: 1, applicantId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } },
);

/**
 * Mục 12C & 27 SRS: Collection active_memberships (unique opportunityId/studentId)
 */
@Schema({ collection: 'active_memberships', timestamps: true })
export class ActiveMembershipModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true, index: true })
  studentId: string;

  @Prop({ required: true, enum: ['LEADER', 'MEMBER'], default: 'MEMBER' })
  role: string;
}

export const ActiveMembershipSchema = SchemaFactory.createForClass(ActiveMembershipModel);
ActiveMembershipSchema.index({ opportunityId: 1, studentId: 1 }, { unique: true });

/**
 * Mục 7 WF07 & 27 SRS: Collection submission_reservations (unique submissionId và fencingToken tăng theo team)
 */
@Schema({ collection: 'submission_reservations', timestamps: true })
export class SubmissionReservationModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, unique: true, index: true })
  submissionId: string;

  @Prop({ required: true, index: true })
  teamId: string;

  @Prop({ required: true, index: true })
  opportunityId: string;

  @Prop({ required: true })
  rosterVersion: number;

  @Prop({ required: true })
  fencingToken: number;

  @Prop({ required: true })
  leaseExpiresAt: Date;

  @Prop({ required: true, enum: ['ACTIVE', 'CONFIRMED', 'ABORTED'], default: 'ACTIVE' })
  status: string;
}

export const SubmissionReservationSchema = SchemaFactory.createForClass(SubmissionReservationModel);
SubmissionReservationSchema.index({ teamId: 1, fencingToken: 1 }, { unique: true });
