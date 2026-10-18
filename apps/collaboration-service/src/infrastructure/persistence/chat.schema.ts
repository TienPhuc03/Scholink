import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatRoomDocument = ChatRoomModel & Document;
export type MessageDocument = MessageModel & Document;

@Schema({ collection: 'chat_rooms', timestamps: true })
export class ChatRoomModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, enum: ['DIRECT', 'TEAM'] })
  type: string;

  @Prop({ index: true })
  refId?: string;

  @Prop({ type: [String], required: true, index: true })
  participants: string[];

  @Prop()
  lastMessageSnippet?: string;

  @Prop()
  lastMessageAt?: Date;

  @Prop({ default: 1 })
  version: number;
}

export const ChatRoomSchema = SchemaFactory.createForClass(ChatRoomModel);

@Schema({ collection: 'messages', timestamps: true })
export class MessageModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ required: true, index: true })
  senderId: string;

  @Prop({ required: true })
  content: string;

  @Prop()
  assetId?: string;

  @Prop({ type: [String], default: [] })
  readBy: string[];
}

export const MessageSchema = SchemaFactory.createForClass(MessageModel);
MessageSchema.index({ roomId: 1, createdAt: -1 });
