import { AggregateRoot, DomainException, ErrorCode } from '@shared';

export type TeamStatus = 'FORMING' | 'ACTIVE' | 'SUBMITTING' | 'SUBMITTED' | 'CLOSED';

export interface TeamMember {
  studentId: string;
  role: 'LEADER' | 'MEMBER';
  joinedAt: Date;
}

export interface TeamProps {
  competitionId: string;
  name: string;
  description?: string;
  leaderId: string;
  minSize: number;
  maxSize: number;
  status: TeamStatus;
  members: TeamMember[];
  rosterVersion: number;
  fencingToken: number;
  currentReservationId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export class Team extends AggregateRoot<string> {
  private _props: TeamProps;

  constructor(id: string, props: TeamProps) {
    super(id, props.version || 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = {
      ...props,
      rosterVersion: props.rosterVersion || 1,
      fencingToken: props.fencingToken || 0,
    };
  }

  get competitionId(): string {
    return this._props.competitionId;
  }

  get leaderId(): string {
    return this._props.leaderId;
  }

  get members(): ReadonlyArray<TeamMember> {
    return this._props.members;
  }

  get status(): TeamStatus {
    return this._props.status;
  }

  get rosterVersion(): number {
    return this._props.rosterVersion;
  }

  get fencingToken(): number {
    return this._props.fencingToken;
  }

  get currentReservationId(): string | undefined {
    return this._props.currentReservationId;
  }

  get props(): Readonly<TeamProps> {
    return this._props;
  }

  public addMember(studentId: string): void {
    if (this._props.status === 'SUBMITTING' || this._props.status === 'SUBMITTED') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Đội đang trong tiến trình nộp hồ sơ (Roster Freeze) hoặc đã nộp xong', 409);
    }

    if (this._props.members.length >= this._props.maxSize) {
      throw new DomainException(ErrorCode.SLOT_FULL, 'Đội thi đã đủ số lượng thành viên tối đa', 409);
    }

    if (this._props.members.some((m) => m.studentId === studentId)) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Thành viên đã có trong đội', 409);
    }

    this._props.members.push({
      studentId,
      role: 'MEMBER',
      joinedAt: new Date(),
    });

    if (this._props.members.length >= this._props.minSize && this._props.status === 'FORMING') {
      this._props.status = 'ACTIVE';
    }

    this._props.rosterVersion += 1;
    this.incrementVersion();
  }

  public removeMember(studentId: string): void {
    if (this._props.status === 'SUBMITTING' || this._props.status === 'SUBMITTED') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Không thể rời hoặc xóa thành viên khi đội đang nộp hồ sơ (Roster Freeze)', 409);
    }

    if (studentId === this._props.leaderId) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Trưởng đội không thể rời đội mà không chuyển quyền', 409);
    }

    this._props.members = this._props.members.filter((m) => m.studentId !== studentId);

    if (this._props.members.length < this._props.minSize && this._props.status === 'ACTIVE') {
      this._props.status = 'FORMING';
    }

    this._props.rosterVersion += 1;
    this.incrementVersion();
  }

  public transferLeader(newLeaderId: string, currentLeaderId: string): void {
    if (this._props.status === 'SUBMITTING' || this._props.status === 'SUBMITTED') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Không thể chuyển quyền trưởng đội khi đang nộp hồ sơ (Roster Freeze)', 409);
    }

    if (currentLeaderId !== this._props.leaderId) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Chỉ trưởng đội mới có quyền chuyển giao vai trò', 403);
    }

    const member = this._props.members.find((m) => m.studentId === newLeaderId);
    if (!member) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Thành viên kế nhiệm không tồn tại trong đội', 404);
    }

    const currentMember = this._props.members.find((m) => m.studentId === currentLeaderId);
    if (currentMember) currentMember.role = 'MEMBER';
    member.role = 'LEADER';
    this._props.leaderId = newLeaderId;
    this.incrementVersion();
  }

  public prepareSubmission(reservationId: string): number {
    if (this._props.members.length < this._props.minSize || this._props.members.length > this._props.maxSize) {
      throw new DomainException(
        ErrorCode.STATE_CONFLICT,
        `Số lượng thành viên (${this._props.members.length}) không đạt yêu cầu [${this._props.minSize} - ${this._props.maxSize}]`,
        422,
      );
    }

    if (this._props.status === 'SUBMITTING') {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Đội đã có phiên chuẩn bị nộp hồ sơ đang diễn ra', 409);
    }

    if (this._props.status === 'SUBMITTED') {
      throw new DomainException(ErrorCode.ALREADY_APPLIED, 'Đội thi đã nộp hồ sơ thành công cho cuộc thi này', 409);
    }

    this._props.status = 'SUBMITTING';
    this._props.fencingToken += 1;
    this._props.currentReservationId = reservationId;
    this.incrementVersion();
    return this._props.fencingToken;
  }

  public confirmSubmission(reservationId: string): void {
    if (this._props.currentReservationId !== reservationId) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Mã phiên nộp không khớp', 409);
    }
    this._props.status = 'SUBMITTED';
    this.incrementVersion();
  }

  public abortSubmission(reservationId: string): void {
    if (this._props.status === 'SUBMITTING' && this._props.currentReservationId === reservationId) {
      this._props.status = this._props.members.length >= this._props.minSize ? 'ACTIVE' : 'FORMING';
      this._props.currentReservationId = undefined;
      this.incrementVersion();
    }
  }
}
