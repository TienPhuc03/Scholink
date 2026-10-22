import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUserRepository, SessionRecord } from '../../domain/ports/user.repository.port';
import { User, UserRole, UserStatus } from '../../domain/user.entity';
import { UserModel, UserDocument, SessionModel, SessionDocument } from './user.schema';

@Injectable()
export class MongooseUserRepository implements IUserRepository {
  constructor(
    @InjectModel(UserModel.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(SessionModel.name)
    private readonly sessionModel: Model<SessionDocument>,
  ) {}

  async findById(id: string): Promise<User | null> {
    const doc = await this.userModel.findOne({ id: String(id) }).lean().exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = String(email).trim().toLowerCase();
    const doc = await this.userModel
      .findOne({ $or: [{ normalizedEmail }, { email: normalizedEmail }] })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async save(user: User): Promise<void> {
    await this.userModel.create({
      id: user.id,
      email: user.email,
      normalizedEmail: user.normalizedEmail,
      passwordHash: user.passwordHash,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      sessionVersion: user.sessionVersion,
      version: user.version,
    });
  }

  async update(user: User): Promise<void> {
    await this.userModel
      .updateOne(
        { id: String(user.id) },
        {
          $set: {
            fullName: user.fullName,
            role: user.role,
            status: user.status,
            sessionVersion: user.sessionVersion,
            version: user.version,
          },
        },
      )
      .exec();
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await this.sessionModel.create({
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      familyId: session.familyId,
      isUsed: session.isUsed,
      isRevoked: session.isRevoked,
      expiresAt: session.expiresAt,
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const doc = await this.sessionModel.findOne({ tokenHash: String(tokenHash) }).lean().exec();
    if (!doc) return null;
    return Object.freeze({
      id: doc.id,
      userId: doc.userId,
      tokenHash: doc.tokenHash,
      familyId: doc.familyId,
      isUsed: doc.isUsed,
      isRevoked: doc.isRevoked,
      expiresAt: new Date(doc.expiresAt),
    });
  }

  async markSessionUsed(sessionId: string): Promise<void> {
    await this.sessionModel
      .updateOne({ id: String(sessionId) }, { $set: { isUsed: true } })
      .exec();
  }

  async revokeSessionFamily(familyId: string, reason: string): Promise<void> {
    await this.sessionModel
      .updateMany(
        { familyId: String(familyId) },
        { $set: { isRevoked: true, revokedReason: reason } },
      )
      .exec();
  }

  private toDomain(doc: {
    id: string;
    email: string;
    normalizedEmail?: string;
    passwordHash: string;
    fullName: string;
    role: string;
    status: string;
    sessionVersion?: number;
    version: number;
  }): User {
    return new User(doc.id, {
      email: doc.email,
      normalizedEmail: doc.normalizedEmail ?? doc.email.trim().toLowerCase(),
      passwordHash: doc.passwordHash,
      fullName: doc.fullName,
      role: doc.role as UserRole,
      status: doc.status as UserStatus,
      sessionVersion: doc.sessionVersion ?? 1,
      version: doc.version,
    });
  }
}
