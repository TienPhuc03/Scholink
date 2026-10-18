import { ChatRoom, Message } from '../chat.entity';

export interface IChatRepository {
  findRoomById(id: string): Promise<ChatRoom | null>;
  findRoomsByUser(userId: string): Promise<ChatRoom[]>;
  saveRoom(room: ChatRoom): Promise<void>;
  updateRoom(room: ChatRoom): Promise<void>;
  findMessagesByRoom(roomId: string, limit?: number): Promise<Message[]>;
  saveMessage(message: Message): Promise<void>;
}

export const CHAT_REPOSITORY = 'CHAT_REPOSITORY';
