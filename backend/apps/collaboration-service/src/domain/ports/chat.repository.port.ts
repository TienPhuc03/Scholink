import { ChatRoom, Message } from '../chat.entity';

export interface OutboxRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, any>;
  status: string;
  retryCount: number;
  nextRetryAt?: Date;
  error?: string;
  sentAt?: Date;
  createdAt: Date;
}

export interface IChatRepository {
  findRoomById(id: string): Promise<ChatRoom | null>;
  findRoomByRefId(refId: string): Promise<ChatRoom | null>;
  findRoomsByUser(userId: string): Promise<ChatRoom[]>;
  saveRoom(room: ChatRoom): Promise<void>;
  updateRoom(room: ChatRoom): Promise<void>;

  // Monotonic seq and atomic message persistence in transaction
  findMessageByClientMsgId(roomId: string, senderId: string, clientMsgId: string): Promise<Message | null>;
  findMessagesByRoom(roomId: string, afterSeq?: number, limit?: number): Promise<Message[]>;
  saveMessageWithOutboxInTransaction(
    roomId: string,
    senderId: string,
    content: string,
    clientMsgId?: string,
    assetId?: string,
    outboxPayload?: any,
  ): Promise<{ message: Message; isDuplicate: boolean }>;

  // Read Receipts (Monotonic non-decreasing)
  updateReadReceipt(roomId: string, userId: string, lastReadSeq: number): Promise<void>;
  getReadReceipt(roomId: string, userId: string): Promise<number>;

  // Outbox Worker
  findPendingOutboxEvents(limit?: number): Promise<OutboxRecord[]>;
  markOutboxPublished(id: string): Promise<void>;
  markOutboxFailed(id: string, error: string, nextRetryAt: Date, retryCount: number): Promise<void>;
}

export const CHAT_REPOSITORY = 'CHAT_REPOSITORY';
