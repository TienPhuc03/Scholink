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
  readonly submittedAt: Date;
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
  findManyByStudent(studentId: string): Promise<Application[]>;
  findManyByOpportunity(opportunityId: string): Promise<Application[]>;
  save(application: Application): Promise<void>;
  update(application: Application): Promise<void>;
  savePreview(preview: SubmissionPreviewRecord): Promise<void>;
  findPreviewById(previewId: string): Promise<SubmissionPreviewRecord | null>;
  saveRevision(revision: ApplicationRevisionRecord): Promise<void>;
  appendEvent(event: ApplicationEventRecord): Promise<void>;
  findRevisionsByApplicationId?(applicationId: string): Promise<ApplicationRevisionRecord[]>;
  findEventsByApplicationId?(applicationId: string): Promise<ApplicationEventRecord[]>;
  commitSubmissionWithOutbox?(params: {
    application: Application;
    isResubmission: boolean;
    revision: ApplicationRevisionRecord;
    event: ApplicationEventRecord;
    outbox: OutboxEventRecord;
  }): Promise<void>;
  commitWithdrawalWithOutbox?(params: {
    application: Application;
    event: ApplicationEventRecord;
    outbox: OutboxEventRecord;
  }): Promise<void>;
}
