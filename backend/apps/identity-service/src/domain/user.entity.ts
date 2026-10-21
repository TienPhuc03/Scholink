import { AggregateRoot } from '@shared';

export type UserRole = 'STUDENT' | 'ORGANIZER' | 'ADMIN';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'BLOCKED' | 'DELETED';

export interface UserProps {
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  fullName: string;
  phone?: string;
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export class User extends AggregateRoot<string> {
  private _props: UserProps;

  constructor(id: string, props: UserProps) {
    super(id, props.version || 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = props;
  }

  get email(): string {
    return this._props.email;
  }

  get fullName(): string {
    return this._props.fullName;
  }

  get role(): UserRole {
    return this._props.role;
  }

  get status(): UserStatus {
    return this._props.status;
  }

  get passwordHash(): string {
    return this._props.passwordHash;
  }

  public activate(): void {
    this._props.status = 'ACTIVE';
    this.incrementVersion();
  }

  public block(): void {
    this._props.status = 'BLOCKED';
    this.incrementVersion();
  }

  public changeRole(newRole: UserRole): void {
    this._props.role = newRole;
    this.incrementVersion();
  }
}
