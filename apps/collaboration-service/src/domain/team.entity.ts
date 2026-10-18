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
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export class Team extends AggregateRoot<string> {
  private _props: TeamProps;

  constructor(id: string, props: TeamProps) {
    super(id, props.version || 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = props;
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

  get props(): Readonly<TeamProps> {
    return this._props;
  }

  public addMember(studentId: string): void {
    if (this._props.members.length >= this._props.maxSize) {
      throw new DomainException(ErrorCode.SLOT_FULL, 'Đội thi đã đủ số lượng thành viên', 409);
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

    this.incrementVersion();
  }

  public removeMember(studentId: string): void {
    if (studentId === this._props.leaderId) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Trưởng đội không thể rời đội mà không chuyển quyền', 409);
    }

    this._props.members = this._props.members.filter((m) => m.studentId !== studentId);

    if (this._props.members.length < this._props.minSize && this._props.status === 'ACTIVE') {
      this._props.status = 'FORMING';
    }

    this.incrementVersion();
  }
}
