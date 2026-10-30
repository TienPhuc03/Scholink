import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatRoomDocument = ChatRoomModel & Document;
export type MessageDocument = MessageModel & Document;
export type OutboxDocument = OutboxModel & Document;
export type ReadReceiptDocument = ReadReceiptModel & Document;

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

@Schema({ collection: 'messages', timestamps: true })
export class MessageModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ required: true, index: true })
  senderId: string;

  @Prop({ required: true, index: true })
  seq: number;

  @Prop({ index: true })
  clientMsgId?: string;

  @Prop({ required: true })
  content: string;

  @Prop()
  assetId?: string;

  @Prop({ type: [String], default: [] })
  readBy: string[];

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(MessageModel);
// Strict monotonic sequence unique index per room
MessageSchema.index({ roomId: 1, seq: 1 }, { unique: true });
// Idempotency: prevent same sender sending duplicate clientMsgId to the room
MessageSchema.index(
  { roomId: 1, senderId: 1, clientMsgId: 1 },
  { unique: true, partialFilterExpression: { clientMsgId: { $type: 'string' } } },
);

@Schema({ collection: 'outbox', timestamps: true })
export class OutboxModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  aggregateType: string;

  @Prop({ required: true, index: true })
  aggregateId: string;

  @Prop({ required: true })
  eventType: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  @Prop({ required: true, default: 'PENDING', index: true })
  status: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const OutboxSchema = SchemaFactory.createForClass(OutboxModel);
OutboxSchema.index({ status: 1, createdAt: 1 });

@Schema({ collection: 'read_receipts', timestamps: true })
export class ReadReceiptModel {
  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, default: 0 })
  lastReadSeq: number;

  @Prop({ default: Date.now })
  readAt: Date;
}

export const ReadReceiptSchema = SchemaFactory.createForClass(ReadReceiptModel);
ReadReceiptSchema.index({ roomId: 1, userId: 1 }, { unique: true });
