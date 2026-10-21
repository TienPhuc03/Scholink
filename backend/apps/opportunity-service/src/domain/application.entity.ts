import { AggregateRoot, DomainException, ErrorCode } from '@shared';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'INELIGIBLE'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'REOPENED'
  | 'CANCELLED';

export interface ApplicationProps {
  opportunityId: string;
  studentId: string;
  teamId?: string;
  submissionType: 'INDIVIDUAL' | 'TEAM';
  status: ApplicationStatus;
  previewId: string;
  snapshotId: string;
  profileVersion: number;
  payloadHash: string;
  consentId: string;
  submittedAt: Date;
  revision: number;
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export class Application extends AggregateRoot<string> {
  private _props: ApplicationProps;

  constructor(id: string, props: ApplicationProps) {
    super(id, props.version || 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = props;
  }

  get opportunityId(): string {
    return this._props.opportunityId;
  }

  get studentId(): string {
    return this._props.studentId;
  }

  get status(): ApplicationStatus {
    return this._props.status;
  }

  get props(): Readonly<ApplicationProps> {
    return this._props;
  }

  public withdraw(): void {
    if (this._props.status === 'ACCEPTED' || this._props.status === 'REJECTED') {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        `Không thể rút hồ sơ đã ở trạng thái ${this._props.status}`,
        409,
      );
    }
    this._props.status = 'WITHDRAWN';
    this.incrementVersion();
  }

  public shortlist(): void {
    if (this._props.status !== 'SUBMITTED') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Chỉ có thể duyệt hồ sơ đã SUBMITTED', 409);
    }
    this._props.status = 'SHORTLISTED';
    this.incrementVersion();
  }

  public accept(): void {
    this._props.status = 'ACCEPTED';
    this.incrementVersion();
  }

  public reject(): void {
    this._props.status = 'REJECTED';
    this.incrementVersion();
  }
}
