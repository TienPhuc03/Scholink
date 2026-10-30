import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = UserModel & Document;
export type SessionDocument = SessionModel & Document;
export type OtpRecordDocument = OtpRecordModel & Document;
export type OrganizationDocument = OrganizationModel & Document;
export type OrganizationMembershipDocument = OrganizationMembershipModel & Document;

/**
 * Mục 27 SRS: Collection users (unique normalizedEmail)
 */
@Schema({ collection: 'users', timestamps: true })
export class UserModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true, unique: true, index: true })
  normalizedEmail: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  fullName: string;

  @Prop()
  phone?: string;

  @Prop({ required: true, enum: ['STUDENT', 'ORGANIZER', 'ADMIN'], default: 'STUDENT', index: true })
  role: string;

  @Prop({
    required: true,
    enum: ['PENDING_VERIFICATION', 'ACTIVE', 'BLOCKED', 'DELETED'],
    default: 'ACTIVE',
    index: true,
  })
  status: string;

  @Prop({ default: 1 })
  sessionVersion: number;

  @Prop({ default: 1 })
  version: number;
}

export const UserSchema = SchemaFactory.createForClass(UserModel);

/**
 * Mục 27 & FR-AUTH-04 SRS: Collection sessions (tokenHash/familyId và TTL expiresAt)
 */
@Schema({ collection: 'sessions', timestamps: true })
export class SessionModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, unique: true, index: true })
  tokenHash: string;

  @Prop({ required: true, index: true })
  familyId: string;

  @Prop({ default: false })
  isUsed: boolean;

  @Prop({ default: false, index: true })
  isRevoked: boolean;

  @Prop()
  revokedReason?: string;

  @Prop({ required: true, index: { expires: 0 } })
  expiresAt: Date;
}

export const SessionSchema = SchemaFactory.createForClass(SessionModel);

/**
 * FR-AUTH-02 & FR-AUTH-03 SRS: Collection otp_records (TTL 5 phút, khóa 15 phút khi sai 5 lần)
 */
@Schema({ collection: 'otp_records', timestamps: true })
export class OtpRecordModel {
  @Prop({ required: true })
  normalizedEmail: string;

  @Prop({ required: true, enum: ['VERIFY_EMAIL', 'RESET_PASSWORD'] })
  purpose: string;

  @Prop({ required: true })
  otpHash: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  lockedUntil?: Date;

  @Prop({ required: true, default: () => new Date() })
  lastSentAt: Date;

  @Prop({ required: true, index: { expires: 0 } })
  expiresAt: Date;
}

export const OtpRecordSchema = SchemaFactory.createForClass(OtpRecordModel);
OtpRecordSchema.index({ normalizedEmail: 1, purpose: 1 }, { unique: true });

/**
 * Mục 2 & 27 SRS: Collection organizations (ACTIVE / SUSPENDED)
 */
@Schema({ collection: 'organizations', timestamps: true })
export class OrganizationModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true })
  status: string;

  @Prop()
  verifiedBy?: string;

  @Prop()
  verifiedAt?: Date;

  @Prop({ default: 1 })
  version: number;
}

export const OrganizationSchema = SchemaFactory.createForClass(OrganizationModel);

/**
 * Mục 2 & 27 SRS: Collection organization_memberships
 * Unique (organizationId, userId), partial unique userId khi ACTIVE
 */
@Schema({ collection: 'organization_memberships', timestamps: true })
export class OrganizationMembershipModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, enum: ['ACTIVE', 'REVOKED'], default: 'ACTIVE', index: true })
  status: string;

  @Prop({ required: true })
  grantedBy: string;

  @Prop({ required: true, default: () => new Date() })
  grantedAt: Date;

  @Prop()
  revokedBy?: string;

  @Prop()
  revokedAt?: Date;

  @Prop()
  reason?: string;

  @Prop({ default: 1 })
  version: number;
}

export const OrganizationMembershipSchema = SchemaFactory.createForClass(
  OrganizationMembershipModel,
);
OrganizationMembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
OrganizationMembershipSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);
