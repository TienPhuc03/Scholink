import { Injectable, Inject, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { IChatRepository, CHAT_REPOSITORY } from '../../domain/ports/chat.repository.port';
import { ITeamRepository, TEAM_REPOSITORY } from '../../domain/ports/team.repository.port';
import { Message, ChatRoom } from '../../domain/chat.entity';
import { SendMessageDto, QueryMessagesDto, MarkReadDto } from '../dtos/collaboration.dto';
import { DomainException, ErrorCode } from '@shared';

@Injectable()
export class ChatUseCase {
  private readonly logger = new Logger(ChatUseCase.name);

  constructor(
    @Inject(CHAT_REPOSITORY) private readonly chatRepo: IChatRepository,
    @Inject(TEAM_REPOSITORY) private readonly teamRepo: ITeamRepository,
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

    await this.assertMemberPermission(room, userId);

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

    // 1. Check user permission (must be active room participant & team member if team room)
    await this.assertMemberPermission(room, senderId);

    // 2. Validate max text length (SRS FR-CHAT-02: max 4,000 characters)
    if (dto.content && dto.content.length > 4000) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        'Nội dung tin nhắn không được vượt quá 4.000 ký tự',
        400,
      );
    }

    // 3. Atomically persist message + seq + outbox in transaction with idempotency check
    const { message, isDuplicate } = await this.chatRepo.saveMessageWithOutboxInTransaction(
      roomId,
      senderId,
      dto.content,
      dto.clientMsgId,
      dto.assetId,
      {
        type: room.type,
        refId: room.refId,
        participants: room.participants,
      },
    );

    return {
      ...message.props,
      id: message.id,
      isDuplicate,
    };
  }

  async markAsRead(roomId: string, userId: string, dto: MarkReadDto) {
    const room = await this.chatRepo.findRoomById(roomId);
    if (!room) {
      throw DomainException.notFound('Phòng chat');
    }

    await this.assertMemberPermission(room, userId);

    // Monotonic non-decreasing read cursor update
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

  /**
   * MQTT Auth & ACL Verification:
   * Checks whether the user is authorized to connect or subscribe/publish to a specific MQTT topic.
   * Immediately revokes permission if team membership has ended.
   */
  async validateMqttAcl(
    userId: string,
    topic: string,
    action: 'subscribe' | 'publish',
  ): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Personal user topics: scholink/users/{userId}/#
    if (topic.startsWith(`scholink/users/${userId}/`) || topic === `scholink/users/${userId}`) {
      return { allowed: true };
    }

    // 2. Chat Room topics: scholink/rooms/{roomId}/# or rooms/{roomId}/#
    const roomMatch = topic.match(/(?:scholink\/)?rooms\/([^/]+)/);
    if (roomMatch) {
      const roomId = roomMatch[1];
      const room = await this.chatRepo.findRoomById(roomId);
      if (!room) {
        return { allowed: false, reason: 'Room not found' };
      }

      // Check if user is in participants
      if (!room.participants.includes(userId)) {
        return { allowed: false, reason: 'User is not a participant in this room' };
      }

      // If team room, check active membership
      if (room.type === 'TEAM' && room.refId) {
        const team = await this.teamRepo.findById(room.refId);
        if (!team) {
          return { allowed: false, reason: 'Team not found' };
        }
        const isMember = team.members.some((m) => m.studentId === userId);
        if (!isMember) {
          return { allowed: false, reason: 'Membership revoked' };
        }
      }

      // Action control
      if (action === 'publish') {
        // Allow client to publish typing/presence or in-room signals; official messages go via REST
        return { allowed: true };
      }

      return { allowed: true };
    }

    return { allowed: false, reason: 'Topic not permitted' };
  }

  private async assertMemberPermission(room: ChatRoom, userId: string): Promise<void> {
    if (!room.participants.includes(userId)) {
      throw new DomainException(
        ErrorCode.FORBIDDEN_RESOURCE,
        'Bạn không ở trong phòng chat này (ACL)',
        403,
      );
    }

    // If it's a team room, verify team membership is still active
    if (room.type === 'TEAM' && room.refId) {
      const team = await this.teamRepo.findById(room.refId);
      if (team) {
        const isMember = team.members.some((m) => m.studentId === userId);
        if (!isMember) {
          throw new DomainException(
            ErrorCode.FORBIDDEN_RESOURCE,
            'Tư cách thành viên đội thi của bạn đã bị thu hồi (ACL)',
            403,
          );
        }
      }
    }
  }
}
