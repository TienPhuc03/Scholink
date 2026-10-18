import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { IChatRepository, CHAT_REPOSITORY } from '../../domain/ports/chat.repository.port';
import { Message } from '../../domain/chat.entity';
import { SendMessageDto } from '../dtos/collaboration.dto';
import { DomainException, ErrorCode } from '@shared';

@Injectable()
export class ChatUseCase {
  constructor(
    @Inject(CHAT_REPOSITORY) private readonly chatRepo: IChatRepository,
  ) {}

  async getMyRooms(userId: string) {
    const rooms = await this.chatRepo.findRoomsByUser(userId);
    return rooms.map((r) => ({ ...r.props, id: r.id }));
  }

  async getMessages(roomId: string, userId: string) {
    const room = await this.chatRepo.findRoomById(roomId);
    if (!room) {
      throw DomainException.notFound('Phòng chat');
    }

    if (!room.participants.includes(userId)) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Bạn không ở trong phòng chat này', 403);
    }

    const messages = await this.chatRepo.findMessagesByRoom(roomId);
    return messages.map((m) => ({ ...m.props, id: m.id }));
  }

  async sendMessage(roomId: string, senderId: string, dto: SendMessageDto) {
    const room = await this.chatRepo.findRoomById(roomId);
    if (!room) {
      throw DomainException.notFound('Phòng chat');
    }

    if (!room.participants.includes(senderId)) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Bạn không ở trong phòng chat này', 403);
    }

    const message = new Message(crypto.randomUUID(), {
      roomId,
      senderId,
      content: dto.content,
      assetId: dto.assetId,
      readBy: [senderId],
    });

    await this.chatRepo.saveMessage(message);
    room.updateLastMessage(dto.content.substring(0, 50));
    await this.chatRepo.updateRoom(room);

    return {
      ...message.props,
      id: message.id,
    };
  }
}
