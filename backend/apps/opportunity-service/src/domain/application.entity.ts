import { AggregateRoot, DomainException, ErrorCode } from '@shared';
import { ScreeningReason } from './opportunity.entity';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'REVIEWING'
  | 'INELIGIBLE'
  | 'SHORTLISTED'
  | 'INTERVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'REOPENED'
  | 'CANCELLED';

export type ScreeningStatus = 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';

export interface ApplicationProps {
  readonly opportunityId: string;
  readonly studentId: string;
  readonly teamId?: string;
  readonly submissionType: 'INDIVIDUAL' | 'TEAM';
  readonly status: ApplicationStatus;
  readonly screening?: ScreeningStatus;
  readonly screeningReasons?: readonly ScreeningReason[];
  readonly previewId: string;
  readonly snapshotId: string;
  readonly profileVersion: number;
  readonly ruleVersion?: number;
  readonly payloadHash: string;
  readonly consentId: string;
  readonly submittedAt: Date;
  readonly revision: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly version?: number;
}

export class Application extends AggregateRoot<string> {
  private readonly _props: Readonly<ApplicationProps>;

  constructor(id: string, props: ApplicationProps) {
    super(
      id,
      props.version || 1,
      props.createdAt || new Date(),
      props.updatedAt || new Date(),
    );
    this._props = Object.freeze({
      ...props,
      screening: props.screening ?? 'ELIGIBLE',
      screeningReasons: Object.freeze([...(props.screeningReasons ?? [])]),
      ruleVersion: props.ruleVersion ?? 1,
    });
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

  get screening(): ScreeningStatus {
    return this._props.screening ?? 'ELIGIBLE';
  }

  get screeningReasons(): readonly ScreeningReason[] {
    return this._props.screeningReasons ?? [];
  }

  get revision(): number {
    return this._props.revision;
  }

  get props(): Readonly<ApplicationProps> {
    return this._props;
  }

  public canResubmit(): boolean {
    return this._props.status === 'WITHDRAWN' || this._props.status === 'REOPENED';
  }

  /**
   * Mục 11 & FR-APP-07 SRS: Rút hồ sơ trước khi ACCEPTED / REJECTED (Immutable update)
   */
  public withdraw(): Application {
    if (
      this._props.status === 'ACCEPTED' ||
      this._props.status === 'REJECTED' ||
      this._props.status === 'CANCELLED' ||
      this._props.status === 'WITHDRAWN'
    ) {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        `Không thể rút hồ sơ đã ở trạng thái ${this._props.status}`,
      );
    }

    return new Application(this.id, {
      ...this._props,
      status: 'WITHDRAWN',
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  /**
   * Mục 11 & FR-APP-07 SRS: Nộp lại trước hạn giữ nguyên Application, tăng revision và gắn snapshot mới
   */
  public resubmit(params: {
    previewId: string;
    snapshotId: string;
    profileVersion: number;
    ruleVersion: number;
    payloadHash: string;
    consentId: string;
    screening?: ScreeningStatus;
    screeningReasons?: readonly ScreeningReason[];
  }): Application {
    if (!this.canResubmit()) {
      throw DomainException.conflict(
        ErrorCode.ALREADY_APPLIED,
        'Bạn đã có hồ sơ đang còn hiệu lực cho cơ hội này',
      );
    }

    const nextScreening = params.screening ?? 'ELIGIBLE';
    const nextStatus: ApplicationStatus =
      nextScreening === 'INELIGIBLE' ? 'INELIGIBLE' : 'SUBMITTED';

    return new Application(this.id, {
      ...this._props,
      status: nextStatus,
      screening: nextScreening,
      screeningReasons: Object.freeze([...(params.screeningReasons ?? [])]),
      previewId: params.previewId,
      snapshotId: params.snapshotId,
      profileVersion: params.profileVersion,
      ruleVersion: params.ruleVersion,
      payloadHash: params.payloadHash,
      consentId: params.consentId,
      submittedAt: new Date(),
      revision: this._props.revision + 1,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  public shortlist(): Application {
    if (this._props.status !== 'SUBMITTED') {
      throw DomainException.conflict(
        ErrorCode.STATE_CONFLICT,
        'Chỉ có thể duyệt hồ sơ đang ở trạng thái SUBMITTED',
      );
    }
    return new Application(this.id, {
      ...this._props,
      status: 'SHORTLISTED',
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  public changeStatus(status: ApplicationStatus): Application {
    return new Application(this.id, {
      ...this._props,
      status,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }
}
