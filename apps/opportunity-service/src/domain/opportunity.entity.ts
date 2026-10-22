import { AggregateRoot, DomainException, ErrorCode } from '@shared';

export type OpportunityType = 'SCHOLARSHIP' | 'COMPETITION';
export type OpportunityStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'CLOSED'
  | 'CANCELLED';
export type ApplyMode = 'IN_APP' | 'EXTERNAL';

export interface OpportunityProps {
  readonly type: OpportunityType;
  readonly title: string;
  readonly description: string;
  readonly organizationId?: string;
  readonly createdBy?: string;
  readonly organizerName: string;
  readonly sourceUrl?: string;
  readonly applyMode: ApplyMode;
  readonly status: OpportunityStatus;
  readonly registerDeadline: Date;
  readonly submitDeadline?: Date;
  readonly timezone: string;
  readonly fundingLevel?: 'FULL' | 'PARTIAL' | 'OTHER';
  readonly competitionMode?: 'INDIVIDUAL' | 'TEAM';
  readonly minTeamSize?: number;
  readonly maxTeamSize?: number;
  readonly eligibilityRules?: readonly Record<string, unknown>[];
  readonly requiredFields?: readonly string[];
  readonly tags?: readonly string[];
  readonly ruleVersion?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly version?: number;
}

export class Opportunity extends AggregateRoot<string> {
  private readonly _props: Readonly<OpportunityProps>;

  constructor(id: string, props: OpportunityProps) {
    super(
      id,
      props.version || 1,
      props.createdAt || new Date(),
      props.updatedAt || new Date(),
    );
    this._props = Object.freeze({
      ...props,
      ruleVersion: props.ruleVersion ?? 1,
      tags: props.tags ? Object.freeze([...props.tags]) : [],
      eligibilityRules: props.eligibilityRules
        ? Object.freeze([...props.eligibilityRules])
        : [],
      requiredFields: props.requiredFields ? Object.freeze([...props.requiredFields]) : [],
    });
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

  get ruleVersion(): number {
    return this._props.ruleVersion ?? 1;
  }

  get props(): Readonly<OpportunityProps> {
    return this._props;
  }

  public publish(): Opportunity {
    if (this._props.status !== 'PENDING_REVIEW' && this._props.status !== 'DRAFT') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        `Không thể công bố cơ hội đang ở trạng thái ${this._props.status}`,
      );
    }
    return new Opportunity(this.id, {
      ...this._props,
      status: 'PUBLISHED',
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  public close(): Opportunity {
    return new Opportunity(this.id, {
      ...this._props,
      status: 'CLOSED',
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  public isRegistrationOpen(now: Date = new Date()): boolean {
    return this._props.status === 'PUBLISHED' && now < this._props.registerDeadline;
  }
}
