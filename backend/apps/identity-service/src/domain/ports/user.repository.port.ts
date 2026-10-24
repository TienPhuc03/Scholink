import { User } from '../user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly isUsed: boolean;
  readonly isRevoked: boolean;
  readonly expiresAt: Date;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  update(user: User): Promise<void>;
  saveSession(session: SessionRecord): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  markSessionUsed(sessionId: string): Promise<void>;
  revokeSessionFamily(familyId: string, reason: string): Promise<void>;
}
