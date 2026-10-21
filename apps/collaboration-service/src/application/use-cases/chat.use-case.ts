import { Injectable, Inject, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { IChatRepository, CHAT_REPOSITORY } from '../../domain/ports/chat.repository.port';
import { Message, ChatRoom } from '../../domain/chat.entity';
import { SendMessageDto, QueryMessagesDto, MarkReadDto } from '../dtos/collaboration.dto';
import { DomainException, ErrorCode } from '@shared';

@Injectable()
export class ChatUseCase {
  private readonly logger = new Logger(ChatUseCase.name);

  constructor(
    @Inject(CHAT_REPOSITORY) private readonly chatRepo: IChatRepository,
  ) {}

  async getMyRooms(userId: string) {
    const rooms = await this.chatRepo.findRoomsByUser(userId);
    const result = await Promise.all(
      rooms.map(async (r) => {
        const lastRead = await this.chatRepo.getReadReceipt(r.id, userId);
        const unreadCount = Math.max(0, r.lastSeq - lastRead);
        return {
          ...r.props,
          id: r.id,
          lastReadSeq: lastRead,
          unreadCount,
        };
      }),
    );
    return result;
  }

  async getMessages(roomId: string, userId: string, query: QueryMessagesDto) {
    const room = await this.chatRepo.findRoomById(roomId);
    if (!room) {
      throw DomainException.notFound('Phòng chat');
    }

    if (!room.participants.includes(userId)) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Bạn không ở trong phòng chat này', 403);
    }

    const messages = await this.chatRepo.findMessagesByRoom(roomId, query.afterSeq, query.limit);
    return {
      roomId,
      roomLastSeq: room.lastSeq,
      messages: messages.map((m) => ({ ...m.props, id: m.id })),
      count: messages.length,
    };
  }

  async sendMessage(roomId: string, senderId: string, dto: SendMessageDto) {
    const room = await this.chatRepo.findRoomById(roomId);
    if (!room) {
      throw DomainException.notFound('Phòng chat');
    }

    if (!room.participants.includes(senderId)) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Bạn không ở trong phòng chat này (ACL)', 403);
    }

    // Idempotency check with clientMsgId
    if (dto.clientMsgId) {
      const existing = await this.chatRepo.findMessageByClientMsgId(roomId, senderId, dto.clientMsgId);
      if (existing) {
        this.logger.log(`[ChatDedup] Bỏ qua tin nhắn trùng clientMsgId ${dto.clientMsgId} từ sender ${senderId}`);
        return {
          ...existing.props,
          id: existing.id,
        };
      }
    }

    // Atomic increment sequence per room
    const nextSeq = await this.chatRepo.atomicNextSeq(roomId, dto.content);

    const message = new Message(`msg_${crypto.randomUUID()}`, {
      roomId,
      senderId,
      seq: nextSeq,
      clientMsgId: dto.clientMsgId,
      content: dto.content,
      assetId: dto.assetId,
      readBy: [senderId],
    });

    // Save message and Outbox event in same transaction boundary
    await this.chatRepo.saveMessageWithOutbox(message, {
      type: room.type,
      refId: room.refId,
      participants: room.participants,
    });

    // Automatically mark read for sender
    await this.chatRepo.updateReadReceipt(roomId, senderId, nextSeq);

    return {
      ...message.props,
      id: message.id,
    };
  }

  async markAsRead(roomId: string, userId: string, dto: MarkReadDto) {
    const room = await this.chatRepo.findRoomById(roomId);
    if (!room) {
      throw DomainException.notFound('Phòng chat');
    }

    if (!room.participants.includes(userId)) {
      throw new DomainException(ErrorCode.FORBIDDEN_RESOURCE, 'Bạn không ở trong phòng chat này', 403);
    }

    await this.chatRepo.updateReadReceipt(roomId, userId, dto.lastReadSeq);

    return {
      roomId,
      userId,
      lastReadSeq: dto.lastReadSeq,
    };
  }

  async createDirectRoom(callerId: string, targetUserId: string) {
    if (callerId === targetUserId) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Không thể tạo phòng chat với chính mình', 400);
    }

    const myRooms = await this.chatRepo.findRoomsByUser(callerId);
    const existing = myRooms.find((r) => r.type === 'DIRECT' && r.participants.includes(targetUserId));
    if (existing) {
      return { ...existing.props, id: existing.id };
    }

    const room = new ChatRoom(`room_${crypto.randomUUID()}`, {
      type: 'DIRECT',
      participants: [callerId, targetUserId],
      lastSeq: 0,
    });

    await this.chatRepo.saveRoom(room);
    return { ...room.props, id: room.id };
  }
}
