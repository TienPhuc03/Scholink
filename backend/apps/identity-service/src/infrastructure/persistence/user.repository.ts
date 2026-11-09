import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  OtpPurpose,
  OutboxDocument,
  OutboxModel,
  RedisService,
  SnapshotRetentionDecision,
} from '@shared';
import {
  DataDeletionTrackingRecord,
  DeletionTrackingStatus,
  IdentityOutboxEventRecord,
  IUserRepository,
  SessionRecord,
} from '../../domain/ports/user.repository.port';
import { User, UserRole, UserStatus } from '../../domain/user.entity';
import { OtpRecord } from '../../domain/otp-record.entity';
import {
  UserModel,
  UserDocument,
  SessionModel,
  SessionDocument,
  OtpRecordModel,
  OtpRecordDocument,
  DataDeletionTrackingModel,
  DataDeletionTrackingDocument,
} from './user.schema';

@Injectable()
export class MongooseUserRepository implements IUserRepository {
  constructor(
    @InjectModel(UserModel.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(SessionModel.name)
    private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(OtpRecordModel.name)
    private readonly otpRecordModel: Model<OtpRecordDocument>,
    @Optional()
    private readonly redisService?: RedisService,
    @Optional()
    @InjectModel(DataDeletionTrackingModel.name)
    private readonly deletionTrackingModel?: Model<DataDeletionTrackingDocument>,
    @Optional()
    @InjectModel(OutboxModel.name)
    private readonly outboxModel?: Model<OutboxDocument>,
  ) {}

  async findById(id: string): Promise<User | null> {
    const doc = await this.userModel.findOne({ id: { $eq: String(id) } }).lean().exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = String(email).trim().toLowerCase();
    const doc = await this.userModel
      .findOne({
        $or: [
          { normalizedEmail: { $eq: normalizedEmail } },
          { email: { $eq: normalizedEmail } },
        ],
      })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async save(user: User): Promise<void> {
    await this.userModel.create({
      id: user.id,
      email: user.email,
      normalizedEmail: user.normalizedEmail,
      passwordHash: user.passwordHash,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      sessionVersion: user.sessionVersion,
      deletedAt: user.props.deletedAt,
      version: user.version,
    });
  }

  async update(user: User): Promise<void> {
    await this.userModel
      .updateOne(
        { id: { $eq: String(user.id) } },
        {
          $set: {
            passwordHash: user.passwordHash,
            fullName: user.fullName,
            role: user.role,
            status: user.status,
            sessionVersion: user.sessionVersion,
            phone: user.props.phone ?? null,
            ...(user.props.deletedAt ? { deletedAt: user.props.deletedAt } : {}),
            version: user.version,
          },
        },
      )
      .exec();
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await this.sessionModel.create({
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      familyId: session.familyId,
      isUsed: session.isUsed,
      isRevoked: session.isRevoked,
      expiresAt: session.expiresAt,
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const doc = await this.sessionModel
      .findOne({ tokenHash: { $eq: String(tokenHash) } })
      .lean()
      .exec();
    if (!doc) return null;
    return Object.freeze({
      id: doc.id,
      userId: doc.userId,
      tokenHash: doc.tokenHash,
      familyId: doc.familyId,
      isUsed: doc.isUsed,
      isRevoked: doc.isRevoked,
      expiresAt: new Date(doc.expiresAt),
    });
  }

  async markSessionUsed(sessionId: string): Promise<void> {
    await this.sessionModel
      .updateOne({ id: { $eq: String(sessionId) } }, { $set: { isUsed: true } })
      .exec();
  }

  async revokeSessionFamily(familyId: string, reason: string): Promise<void> {
    await this.sessionModel
      .updateMany(
        { familyId: { $eq: String(familyId) } },
        { $set: { isRevoked: true, revokedReason: String(reason) } },
      )
      .exec();
  }

  async revokeAllUserSessions(userId: string, reason: string): Promise<void> {
    await this.sessionModel
      .updateMany(
        { userId: { $eq: String(userId) }, isRevoked: { $eq: false } },
        { $set: { isRevoked: true, revokedReason: String(reason) } },
      )
      .exec();

    // SCHOL-14: reject tokens issued before now, without blocking the next login (7 days TTL)
    if (this.redisService?.isAvailable) {
      const revokedAtSeconds = Math.floor(Date.now() / 1000);
      await this.redisService.set(`revoked_before:${userId}`, String(revokedAtSeconds), 7 * 24 * 3600);
    }
  }

  async findOtpRecord(normalizedEmail: string, purpose: OtpPurpose): Promise<OtpRecord | null> {
    const safeEmail = String(normalizedEmail).trim().toLowerCase();
    const safePurpose = String(purpose) as OtpPurpose;
    const doc = await this.otpRecordModel
      .findOne({
        normalizedEmail: { $eq: safeEmail },
        purpose: { $eq: safePurpose },
      })
      .lean()
      .exec();
    if (!doc) return null;
    return new OtpRecord({
      normalizedEmail: doc.normalizedEmail,
      purpose: doc.purpose as OtpPurpose,
      otpHash: doc.otpHash,
      attempts: doc.attempts ?? 0,
      lockedUntil: doc.lockedUntil ? new Date(doc.lockedUntil) : undefined,
      lastSentAt: new Date(doc.lastSentAt),
      expiresAt: new Date(doc.expiresAt),
    });
  }

  async saveOtpRecord(record: OtpRecord): Promise<void> {
    await this.otpRecordModel
      .updateOne(
        {
          normalizedEmail: { $eq: String(record.normalizedEmail) },
          purpose: { $eq: String(record.purpose) },
        },
        {
          $set: {
            normalizedEmail: record.normalizedEmail,
            purpose: record.purpose,
            otpHash: record.otpHash,
            attempts: record.attempts,
            lockedUntil: record.lockedUntil ?? null,
            lastSentAt: record.lastSentAt,
            expiresAt: record.expiresAt,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async deleteOtpRecord(normalizedEmail: string, purpose: OtpPurpose): Promise<void> {
    await this.otpRecordModel
      .deleteOne({
        normalizedEmail: { $eq: String(normalizedEmail).trim().toLowerCase() },
        purpose: { $eq: String(purpose) },
      })
      .exec();
  }

  async saveDeletionTracking(record: DataDeletionTrackingRecord): Promise<void> {
    if (!this.deletionTrackingModel) return;
    await this.deletionTrackingModel.create({
      trackingId: record.trackingId,
      userId: record.userId,
      status: record.status,
      snapshotDecision: record.snapshotDecision,
      revokedSessionVersion: record.revokedSessionVersion,
      sessionsRevoked: record.sessionsRevoked,
      ledgerPreserved: record.ledgerPreserved,
      scheduledPurgeAt: record.scheduledPurgeAt,
      requestedAt: record.requestedAt,
      reason: record.reason,
    });
  }

  async findDeletionTrackingById(trackingId: string): Promise<DataDeletionTrackingRecord | null> {
    if (!this.deletionTrackingModel) return null;
    const doc = await this.deletionTrackingModel
      .findOne({ trackingId: { $eq: String(trackingId) } })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toTrackingRecord(doc);
  }

  async findDeletionTrackingsByUser(userId: string): Promise<DataDeletionTrackingRecord[]> {
    if (!this.deletionTrackingModel) return [];
    const docs = await this.deletionTrackingModel
      .find({ userId: { $eq: String(userId) } })
      .sort({ requestedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toTrackingRecord(d));
  }

  async saveOutboxEvent(event: IdentityOutboxEventRecord): Promise<void> {
    if (!this.outboxModel) return;
    await this.outboxModel.create({
      eventId: event.eventId,
      type: event.type,
      occurredAt: event.occurredAt,
      producer: event.producer,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      correlationId: event.correlationId,
      data: event.data,
    });
  }

  private toTrackingRecord(doc: {
    trackingId: string;
    userId: string;
    status: string;
    snapshotDecision: string;
    revokedSessionVersion: number;
    sessionsRevoked: boolean;
    ledgerPreserved: boolean;
    scheduledPurgeAt: Date;
    requestedAt: Date;
    reason?: string;
  }): DataDeletionTrackingRecord {
    return Object.freeze({
      trackingId: doc.trackingId,
      userId: doc.userId,
      status: doc.status as DeletionTrackingStatus,
      snapshotDecision: doc.snapshotDecision as SnapshotRetentionDecision,
      revokedSessionVersion: doc.revokedSessionVersion,
      sessionsRevoked: doc.sessionsRevoked,
      ledgerPreserved: doc.ledgerPreserved,
      scheduledPurgeAt: new Date(doc.scheduledPurgeAt),
      requestedAt: new Date(doc.requestedAt),
      reason: doc.reason,
    });
  }

  private toDomain(doc: {
    id: string;
    email: string;
    normalizedEmail?: string;
    passwordHash: string;
    fullName: string;
    role: string;
    status: string;
    phone?: string | null;
    sessionVersion?: number;
    deletedAt?: Date;
    version: number;
  }): User {
    return new User(doc.id, {
      email: doc.email,
      normalizedEmail: doc.normalizedEmail ?? doc.email.trim().toLowerCase(),
      passwordHash: doc.passwordHash,
      fullName: doc.fullName,
      role: doc.role as UserRole,
      status: doc.status as UserStatus,
      // Mapped so that other account updates (password reset, block…) keep the stored phone.
      phone: doc.phone ?? undefined,
      sessionVersion: doc.sessionVersion ?? 1,
      deletedAt: doc.deletedAt ? new Date(doc.deletedAt) : undefined,
      version: doc.version,
    });
  }
}
