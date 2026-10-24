import { AggregateRoot } from '@shared';

export type UserRole = 'STUDENT' | 'ORGANIZER' | 'ADMIN';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'BLOCKED' | 'DELETED';

export interface UserProps {
  readonly email: string;
  readonly normalizedEmail: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly fullName: string;
  readonly phone?: string;
  readonly sessionVersion?: number;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly version?: number;
}

export class User extends AggregateRoot<string> {
  private readonly _props: Readonly<UserProps>;

  constructor(id: string, props: Omit<UserProps, 'normalizedEmail'> & { normalizedEmail?: string }) {
    super(
      id,
      props.version ?? 1,
      props.createdAt ?? new Date(),
      props.updatedAt ?? new Date(),
    );
    const normalizedEmail = (props.normalizedEmail ?? props.email).trim().toLowerCase();
    this._props = Object.freeze({
      ...props,
      email: props.email.trim(),
      normalizedEmail,
      sessionVersion: props.sessionVersion ?? 1,
    });
  }

  get email(): string {
    return this._props.email;
  }

  get normalizedEmail(): string {
    return this._props.normalizedEmail;
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

  get sessionVersion(): number {
    return this._props.sessionVersion ?? 1;
  }

  get props(): Readonly<UserProps> {
    return this._props;
  }

  public activate(): User {
    return new User(this.id, {
      ...this._props,
      status: 'ACTIVE',
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  public block(): User {
    return new User(this.id, {
      ...this._props,
      status: 'BLOCKED',
      sessionVersion: this.sessionVersion + 1,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  public changeRole(newRole: UserRole): User {
    return new User(this.id, {
      ...this._props,
      role: newRole,
      sessionVersion: this.sessionVersion + 1,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }
}
