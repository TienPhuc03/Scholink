import { Application } from '../application.entity';

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
  readonly submittedAt: Date;
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
  appendEvent(event: {
    id: string;
    applicationId: string;
    actorId: string;
    fromStatus?: string;
    toStatus: string;
    revision: number;
    reason?: string;
  }): Promise<void>;
}
