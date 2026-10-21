import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IUserRepository } from '../../domain/ports/user.repository.port';
import { User, UserRole, UserStatus } from '../../domain/user.entity';
import { UserModel, UserDocument } from './user.schema';

@Injectable()
export class MongooseUserRepository implements IUserRepository {
  constructor(
    @InjectModel(UserModel.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findById(id: string): Promise<User | null> {
    const doc = await this.userModel.findOne({ id }).exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await this.userModel.findOne({ email }).exec();
    if (!doc) return null;
    return this.toDomain(doc);
  }

  async save(user: User): Promise<void> {
    await this.userModel.create({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      version: user.version,
    });
  }

  async update(user: User): Promise<void> {
    await this.userModel
      .updateOne(
        { id: user.id },
        {
          fullName: user.fullName,
          role: user.role,
          status: user.status,
          version: user.version,
        },
      )
      .exec();
  }

  private toDomain(doc: UserDocument): User {
    return new User(doc.id, {
      email: doc.email,
      passwordHash: doc.passwordHash,
      fullName: doc.fullName,
      role: doc.role as UserRole,
      status: doc.status as UserStatus,
      version: doc.version,
    });
  }
}
