import { Application } from '../application.entity';
import { ScreeningReason } from '../opportunity.entity';

export const APPLICATION_REPOSITORY = Symbol('APPLICATION_REPOSITORY');

export interface SubmissionPreviewRecord {
  readonly previewId: string;
  readonly actorId: string;
  readonly opportunityId: string;
  readonly submissionId: string;
  readonly snapshotId: string;
  readonly profileVersion: number;
  readonly ruleVersion: number;
  readonly snapshotJson: string;
  readonly manifestJson: string;
  readonly manifestHash: string;
  readonly payloadHash: string;
  readonly screening: 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';
  readonly screeningReasons?: readonly ScreeningReason[];
  readonly expiresAt: Date;
}

export interface TeamMemberConsentRefRecord {
  readonly studentId: string;
  readonly previewId: string;
  readonly snapshotId: string;
  readonly profileVersion: number;
  readonly payloadHash: string;
  readonly consentId: string;
}

export interface TeamMemberSnapshotRecord {
  readonly studentId: string;
  readonly previewId: string;
  readonly snapshotId: string;
  readonly profileVersion: number;
  readonly snapshotJson: string;
  readonly manifestJson: string;
  readonly payloadHash: string;
  readonly consentId: string;
  readonly screening: 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';
  readonly screeningReasons?: readonly ScreeningReason[];
}

export type SnapshotRetentionStatus = 'ACTIVE' | 'RETAINED_BY_POLICY' | 'PURGED_ANONYMIZED';

export interface ApplicationRevisionRecord {
  readonly id: string;
  readonly applicationId: string;
  readonly revision: number;
  readonly previewId: string;
  readonly snapshotId: string;
  readonly profileVersion: number;
  readonly ruleVersion: number;
  readonly snapshotJson: string;
  readonly manifestJson: string;
  readonly payloadHash: string;
  readonly consentId: string;
  readonly screening: 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';
  readonly screeningReasons?: readonly ScreeningReason[];
  readonly rosterVersion?: number;
  readonly memberSnapshots?: readonly TeamMemberSnapshotRecord[];
  readonly consentRefs?: readonly TeamMemberConsentRefRecord[];
  readonly retentionStatus?: SnapshotRetentionStatus;
  readonly submittedAt: Date;
}

export interface SnapshotRetentionSummaryRecord {
  readonly studentId: string;
  readonly decision: 'RETAIN' | 'PURGE';
  readonly trackingId?: string;
  readonly purgedPreviewsCount: number;
  readonly withdrawnApplicationsCount: number;
  readonly retainedSnapshotsCount: number;
  readonly purgedSnapshotsCount: number;
  readonly processedAt: Date;
}

export interface ApplicationEventRecord {
  readonly id: string;
  readonly applicationId: string;
  readonly actorId: string;
  readonly fromStatus?: string;
  readonly toStatus: string;
  readonly revision: number;
  readonly reason?: string;
}

export interface ApplicationMemberRecord {
  readonly id: string;
  readonly opportunityId: string;
  readonly applicationId: string;
  readonly studentId: string;
  readonly isActive: boolean;
}

export type SubmissionIntentStatus = 'PENDING' | 'COMMITTED' | 'ABORTED';

export interface SubmissionIntentRecord {
  readonly submissionId: string;
  readonly opportunityId: string;
  readonly teamId: string;
  readonly leaderId: string;
  readonly status: SubmissionIntentStatus;
  readonly applicationId?: string;
  readonly reservationId?: string;
  readonly fencingToken?: number;
  readonly rosterVersion?: number;
  readonly memberIds?: readonly string[];
  readonly reason?: string;
}

export interface OutboxEventRecord {
  readonly eventId: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly producer: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly correlationId: string;
  readonly data: Record<string, unknown>;
}

export interface IApplicationRepository {
  findById(id: string): Promise<Application | null>;
  findByOpportunityAndStudent(
    opportunityId: string,
    studentId: string,
  ): Promise<Application | null>;
  findByOpportunityAndTeam?(
    opportunityId: string,
    teamId: string,
  ): Promise<Application | null>;
  findManyByStudent(studentId: string): Promise<Application[]>;
  findManyByOpportunity(opportunityId: string): Promise<Application[]>;
  findApplicationByTeamId?(teamId: string): Promise<Application | null>;
  save(application: Application): Promise<void>;
  update(application: Application): Promise<void>;
  savePreview(preview: SubmissionPreviewRecord): Promise<void>;
  findPreviewById(previewId: string): Promise<SubmissionPreviewRecord | null>;
  saveRevision(revision: ApplicationRevisionRecord): Promise<void>;
  findLatestRevision?(applicationId: string): Promise<ApplicationRevisionRecord | null>;
  appendEvent(event: ApplicationEventRecord): Promise<void>;
  findRevisionsByApplicationId?(applicationId: string): Promise<ApplicationRevisionRecord[]>;
  findEventsByApplicationId?(applicationId: string): Promise<ApplicationEventRecord[]>;
  findEventsByApplication?(applicationId: string): Promise<any[]>;
  findActiveMembersByOpportunityAndStudents?(
    opportunityId: string,
    studentIds: readonly string[],
  ): Promise<ApplicationMemberRecord[]>;
  createOrGetSubmissionIntent?(intent: SubmissionIntentRecord): Promise<SubmissionIntentRecord>;
  findSubmissionIntentById?(submissionId: string): Promise<SubmissionIntentRecord | null>;
  abortSubmissionIntent?(params: {
    submissionId: string;
    opportunityId?: string;
    teamId?: string;
    leaderId?: string;
    reason?: string;
  }): Promise<SubmissionIntentRecord & { readonly aborted: boolean }>;
  releaseApplicationMembers?(applicationId: string): Promise<void>;
  commitSubmissionWithOutbox?(params: {
    application: Application;
    isResubmission: boolean;
    revision: ApplicationRevisionRecord;
    event: ApplicationEventRecord;
    outbox: OutboxEventRecord;
    submissionIntent?: SubmissionIntentRecord;
    activeMemberIds?: readonly string[];
  }): Promise<void>;
  commitWithdrawalWithOutbox?(params: {
    application: Application;
    event: ApplicationEventRecord;
    outbox: OutboxEventRecord;
  }): Promise<void>;
  deletePreviewsByStudent?(studentId: string): Promise<number>;
  applySnapshotRetentionByStudent?(params: {
    studentId: string;
    decision: 'RETAIN' | 'PURGE';
    trackingId?: string;
  }): Promise<SnapshotRetentionSummaryRecord>;

  // Submission Intent tracking (SCHOL-20 & WF07 race resolution)
  findSubmissionIntent?(teamId: string, submissionId: string): Promise<{ status: string } | null>;
  upsertSubmissionIntent?(intent: {
    submissionId: string;
    opportunityId: string;
    teamId: string;
    leaderId: string;
    status: string;
    applicationId?: string;
  }): Promise<void>;
}
