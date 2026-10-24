import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatRoomDocument = ChatRoomModel & Document;
export type MessageDocument = MessageModel & Document;
export type ReadReceiptDocument = ReadReceiptModel & Document;

/**
 * Mục 19 & 27 SRS: Collection chat_rooms
 */
@Schema({ collection: 'chat_rooms', timestamps: true })
export class ChatRoomModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, enum: ['DIRECT', 'TEAM'] })
  type: string;

  @Prop({ index: true })
  refId?: string;

  @Prop({ type: [String], required: true, index: true })
  participants: string[];

  @Prop({ default: 0 })
  lastSeq: number;

  @Prop()
  lastMessageSnippet?: string;

  @Prop()
  lastMessageAt?: Date;

  @Prop({ default: 1 })
  version: number;
}

export const ChatRoomSchema = SchemaFactory.createForClass(ChatRoomModel);

/**
 * Mục 19 & 27 SRS: Collection messages
 * Unique (roomId, seq) và (roomId, senderId, clientMsgId)
 */
@Schema({ collection: 'messages', timestamps: true })
export class MessageModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ required: true, index: true })
  senderId: string;

  @Prop({ default: () => `msg_${Date.now()}` })
  clientMsgId: string;

  @Prop({ default: 1 })
  seq: number;

  @Prop({ required: true, maxlength: 4000 })
  content: string;

  @Prop()
  assetId?: string;

  @Prop({ type: [String], default: [] })
  readBy: string[];
}

export const MessageSchema = SchemaFactory.createForClass(MessageModel);
MessageSchema.index({ roomId: 1, seq: 1 });
MessageSchema.index({ roomId: 1, senderId: 1, clientMsgId: 1 });
MessageSchema.index({ roomId: 1, createdAt: -1 });

/**
 * Mục 19 & 27 SRS: Collection read_receipts (unique roomId/userId, lastReadSeq không giảm)
 */
@Schema({ collection: 'read_receipts', timestamps: true })
export class ReadReceiptModel {
  @Prop({ required: true })
  roomId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, default: 0 })
  lastReadSeq: number;
}

export const ReadReceiptSchema = SchemaFactory.createForClass(ReadReceiptModel);
ReadReceiptSchema.index({ roomId: 1, userId: 1 }, { unique: true });
