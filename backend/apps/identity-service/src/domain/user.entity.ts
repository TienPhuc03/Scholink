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
  readonly deletedAt?: Date;
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
    Object.freeze(this);
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

  get phone(): string | undefined {
    return this._props.phone;
  }

  /** FR-PROF-05: contact phone; an empty value removes it. */
  public withPhone(phone: string): User {
    const trimmed = phone.trim();
    return new User(this.id, {
      ...this._props,
      phone: trimmed.length > 0 ? trimmed : undefined,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  public activate(): User {
    return new User(this.id, {
      ...this._props,
      status: 'ACTIVE',
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }

  /**
   * FR-AUTH-03 & FR-AUTH-04: Đặt lại mật khẩu mới (Immutable update) và tự động tăng `sessionVersion`
   * để vô hiệu hóa toàn bộ các phiên Refresh Token cũ trước đó.
   */
  public withPasswordReset(newPasswordHash: string): User {
    return new User(this.id, {
      ...this._props,
      passwordHash: newPasswordHash,
      status: this._props.status === 'PENDING_VERIFICATION' ? 'ACTIVE' : this._props.status,
      sessionVersion: this.sessionVersion + 1,
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

  /**
   * F40 Backend — FR-AUTH-08, Mục 28, Mục 29, E13 SRS:
   * Đánh dấu xóa tài khoản (status = DELETED) và tăng sessionVersion
   * để thu hồi ngay toàn bộ phiên làm việc hiện tại.
   */
  public markDeleted(): User {
    return new User(this.id, {
      ...this._props,
      status: 'DELETED',
      deletedAt: new Date(),
      sessionVersion: this.sessionVersion + 1,
      version: this.version + 1,
      updatedAt: new Date(),
    });
  }
}
