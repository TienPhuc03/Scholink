import { Entity, DomainException, ErrorCode } from '@shared';

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'ABORTED';

export interface TeamMemberConsent {
  studentId: string;
  consentId: string;
  snapshotId: string;
  payloadHash: string;
  confirmedAt: Date;
}

export interface SubmissionReservationProps {
  teamId: string;
  competitionId: string;
  fencingToken: number;
  rosterVersion: number;
  members: string[];
  leaseExpiresAt: Date;
  status: ReservationStatus;
  consents: TeamMemberConsent[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class SubmissionReservation extends Entity<string> {
  private _props: SubmissionReservationProps;

  constructor(id: string, props: SubmissionReservationProps) {
    super(id, 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = {
      ...props,
      consents: props.consents || [],
    };
  }

  get teamId(): string {
    return this._props.teamId;
  }

  get competitionId(): string {
    return this._props.competitionId;
  }

  get fencingToken(): number {
    return this._props.fencingToken;
  }

  get rosterVersion(): number {
    return this._props.rosterVersion;
  }

  get members(): ReadonlyArray<string> {
    return this._props.members;
  }

  get leaseExpiresAt(): Date {
    return this._props.leaseExpiresAt;
  }

  get status(): ReservationStatus {
    return this._props.status;
  }

  get consents(): ReadonlyArray<TeamMemberConsent> {
    return this._props.consents;
  }

  get props(): Readonly<SubmissionReservationProps> {
    return this._props;
  }

  public isExpired(): boolean {
    return new Date() > this._props.leaseExpiresAt;
  }

  public addMemberConsent(consent: TeamMemberConsent): void {
    if (this._props.status !== 'PENDING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Phiên giữ chỗ không ở trạng thái chờ xác nhận', 409);
    }

    if (this.isExpired()) {
      throw new DomainException(ErrorCode.HOLD_EXPIRED, 'Thời hạn phiên giữ chỗ đã hết hạn (Lease Expired)', 409);
    }

    if (!this._props.members.includes(consent.studentId)) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Thành viên không thuộc danh sách đăng ký của đội', 403);
    }

    const existingIndex = this._props.consents.findIndex((c) => c.studentId === consent.studentId);
    if (existingIndex >= 0) {
      this._props.consents[existingIndex] = consent;
    } else {
      this._props.consents.push(consent);
    }
  }

  public hasAllConsents(): boolean {
    return this._props.members.every((mId) => this._props.consents.some((c) => c.studentId === mId));
  }

  public confirm(): void {
    if (this.isExpired()) {
      throw new DomainException(ErrorCode.HOLD_EXPIRED, 'Phiên giữ chỗ đã hết hạn, không thể xác nhận nộp', 409);
    }

    if (!this.hasAllConsents()) {
      throw new DomainException(ErrorCode.CONSENT_MISMATCH, 'Chưa thu thập đủ chữ ký đồng thuận (Consent) của mọi thành viên', 422);
    }

    this._props.status = 'CONFIRMED';
  }

  public abort(): void {
    this._props.status = 'ABORTED';
  }
}
