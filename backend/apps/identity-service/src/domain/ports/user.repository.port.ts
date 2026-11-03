import { OtpPurpose, SnapshotRetentionDecision } from '@shared';
import { User } from '../user.entity';
import { OtpRecord } from '../otp-record.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly isUsed: boolean;
  readonly isRevoked: boolean;
  readonly expiresAt: Date;
}

export type DeletionTrackingStatus = 'SCHEDULED_PURGE' | 'COMPLETED' | 'RETAINED_BY_POLICY';

export interface DataDeletionTrackingRecord {
  readonly trackingId: string;
  readonly userId: string;
  readonly status: DeletionTrackingStatus;
  readonly snapshotDecision: SnapshotRetentionDecision;
  readonly revokedSessionVersion: number;
  readonly sessionsRevoked: boolean;
  readonly ledgerPreserved: boolean;
  readonly scheduledPurgeAt: Date;
  readonly requestedAt: Date;
  readonly reason?: string;
}

export interface IdentityOutboxEventRecord {
  readonly eventId: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly producer: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly correlationId: string;
  readonly data: Record<string, unknown>;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  update(user: User): Promise<void>;
  saveSession(session: SessionRecord): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  markSessionUsed(sessionId: string): Promise<void>;
  revokeSessionFamily(familyId: string, reason: string): Promise<void>;
  revokeAllUserSessions(userId: string, reason: string): Promise<void>;
  findOtpRecord(normalizedEmail: string, purpose: OtpPurpose): Promise<OtpRecord | null>;
  saveOtpRecord(record: OtpRecord): Promise<void>;
  deleteOtpRecord(normalizedEmail: string, purpose: OtpPurpose): Promise<void>;
  saveDeletionTracking?(record: DataDeletionTrackingRecord): Promise<void>;
  findDeletionTrackingById?(trackingId: string): Promise<DataDeletionTrackingRecord | null>;
  findDeletionTrackingsByUser?(userId: string): Promise<DataDeletionTrackingRecord[]>;
  saveOutboxEvent?(event: IdentityOutboxEventRecord): Promise<void>;
}
