import { AggregateRoot, DomainException, ErrorCode } from '@shared';

export type OpportunityType = 'SCHOLARSHIP' | 'COMPETITION';
export type OpportunityStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
export type ApplyMode = 'IN_APP' | 'EXTERNAL';

export interface OpportunityProps {
  type: OpportunityType;
  title: string;
  description: string;
  organizationId?: string;
  organizerName: string;
  sourceUrl?: string;
  applyMode: ApplyMode;
  status: OpportunityStatus;
  registerDeadline: Date;
  submitDeadline?: Date;
  timezone: string;
  fundingLevel?: 'FULL' | 'PARTIAL' | 'OTHER';
  competitionMode?: 'INDIVIDUAL' | 'TEAM';
  minTeamSize?: number;
  maxTeamSize?: number;
  eligibilityRules?: Record<string, any>[];
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export class Opportunity extends AggregateRoot<string> {
  private _props: OpportunityProps;

  constructor(id: string, props: OpportunityProps) {
    super(id, props.version || 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = props;
  }

  get type(): OpportunityType {
    return this._props.type;
  }

  get title(): string {
    return this._props.title;
  }

  get status(): OpportunityStatus {
    return this._props.status;
  }

  get applyMode(): ApplyMode {
    return this._props.applyMode;
  }

  get registerDeadline(): Date {
    return this._props.registerDeadline;
  }

  get props(): Readonly<OpportunityProps> {
    return this._props;
  }

  public publish(): void {
    if (this._props.status !== 'PENDING_REVIEW') {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        `Không thể công bố cơ hội đang ở trạng thái ${this._props.status}`,
        409,
      );
    }
    this._props.status = 'PUBLISHED';
    this.incrementVersion();
  }

  public close(): void {
    this._props.status = 'CLOSED';
    this.incrementVersion();
  }

  public isRegistrationOpen(): boolean {
    return this._props.status === 'PUBLISHED' && new Date() < this._props.registerDeadline;
  }
}
