import { Entity, DomainException, ErrorCode } from '@shared';

export type JoinRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

export interface JoinRequestProps {
  teamId: string;
  competitionId: string;
  applicantId: string;
  message?: string;
  status: JoinRequestStatus;
  appliedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
}

export class JoinRequest extends Entity<string> {
  private _props: JoinRequestProps;

  constructor(id: string, props: JoinRequestProps) {
    super(id, 1, props.appliedAt || new Date(), props.reviewedAt || new Date());
    this._props = props;
  }

  get teamId(): string {
    return this._props.teamId;
  }

  get competitionId(): string {
    return this._props.competitionId;
  }

  get applicantId(): string {
    return this._props.applicantId;
  }

  get status(): JoinRequestStatus {
    return this._props.status;
  }

  get props(): Readonly<JoinRequestProps> {
    return this._props;
  }

  public accept(leaderId: string): void {
    if (this._props.status !== 'PENDING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Yêu cầu gia nhập không ở trạng thái chờ duyệt', 409);
    }
    this._props.status = 'ACCEPTED';
    this._props.reviewedAt = new Date();
    this._props.reviewedBy = leaderId;
  }

  public reject(leaderId: string): void {
    if (this._props.status !== 'PENDING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Yêu cầu gia nhập không ở trạng thái chờ duyệt', 409);
    }
    this._props.status = 'REJECTED';
    this._props.reviewedAt = new Date();
    this._props.reviewedBy = leaderId;
  }

  public withdraw(applicantId: string): void {
    if (applicantId !== this._props.applicantId) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Chỉ ứng viên mới có quyền rút yêu cầu', 403);
    }
    if (this._props.status !== 'PENDING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Chỉ có thể rút yêu cầu đang chờ duyệt', 409);
    }
    this._props.status = 'WITHDRAWN';
  }
}
