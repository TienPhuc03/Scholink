import { ChatRoom, Message } from '../chat.entity';

export interface IChatRepository {
  findRoomById(id: string): Promise<ChatRoom | null>;
  findRoomByRefId(refId: string): Promise<ChatRoom | null>;
  findRoomsByUser(userId: string): Promise<ChatRoom[]>;
  saveRoom(room: ChatRoom): Promise<void>;
  updateRoom(room: ChatRoom): Promise<void>;
  
  // Monotonic seq and atomic message persistence
  atomicNextSeq(roomId: string, snippet: string): Promise<number>;
  findMessageByClientMsgId(roomId: string, senderId: string, clientMsgId: string): Promise<Message | null>;
  findMessagesByRoom(roomId: string, afterSeq?: number, limit?: number): Promise<Message[]>;
  saveMessageWithOutbox(message: Message, outboxPayload: any): Promise<void>;
  
  // Read Receipts
  updateReadReceipt(roomId: string, userId: string, lastReadSeq: number): Promise<void>;
  getReadReceipt(roomId: string, userId: string): Promise<number>;
}

export const CHAT_REPOSITORY = 'CHAT_REPOSITORY';
