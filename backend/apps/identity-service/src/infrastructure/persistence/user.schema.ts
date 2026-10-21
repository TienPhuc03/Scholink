import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = UserModel & Document;

@Schema({ collection: 'users', timestamps: true })
export class UserModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true, enum: ['STUDENT', 'ORGANIZER', 'ADMIN'], default: 'STUDENT' })
  role: string;

  @Prop({ required: true, enum: ['PENDING_VERIFICATION', 'ACTIVE', 'BLOCKED', 'DELETED'], default: 'ACTIVE' })
  status: string;

  @Prop({ default: 1 })
  version: number;
}

export const UserSchema = SchemaFactory.createForClass(UserModel);
