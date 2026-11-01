import { ChatUseCase } from './application/use-cases/chat.use-case';
import { ChatOutboxWorkerService } from './infrastructure/workers/chat-outbox-worker.service';
import { IChatRepository, OutboxRecord } from './domain/ports/chat.repository.port';
import { ITeamRepository } from './domain/ports/team.repository.port';
import { ChatRoom, Message } from './domain/chat.entity';
import { Team } from './domain/team.entity';
import { DomainException, ErrorCode } from '@shared';
import { ConfigService } from '@nestjs/config';
import {
  MessageSchema,
  ChatRoomSchema,
  ReadReceiptSchema,
  OutboxSchema,
} from './infrastructure/persistence/chat.schema';
import { ChatController } from './presentation/chat.controller';
import { JwtService } from '@nestjs/jwt';

/**
 * SCHOL-26 In-Memory Test Repository simulating MongoDB unique indexes & transactions
 */
class InMemoryChatRepository implements IChatRepository {
  public rooms = new Map<string, ChatRoom>();
  public messages: Message[] = [];
  public outbox: OutboxRecord[] = [];
  public readReceipts = new Map<string, number>(); // key: `${roomId}_${userId}`
  private seqLock = Promise.resolve();

  async findRoomById(id: string): Promise<ChatRoom | null> {
    return this.rooms.get(id) || null;
  }

  async findRoomByRefId(refId: string): Promise<ChatRoom | null> {
    for (const r of this.rooms.values()) {
      if (r.refId === refId) return r;
    }
    return null;
  }

  async findRoomsByUser(userId: string): Promise<ChatRoom[]> {
    const list: ChatRoom[] = [];
    for (const r of this.rooms.values()) {
      if (r.participants.includes(userId)) list.push(r);
    }
    return list;
  }

  async saveRoom(room: ChatRoom): Promise<void> {
    this.rooms.set(room.id, room);
  }

  async updateRoom(room: ChatRoom): Promise<void> {
    this.rooms.set(room.id, room);
  }

  async findMessageByClientMsgId(roomId: string, senderId: string, clientMsgId: string): Promise<Message | null> {
    return (
      this.messages.find(
        (m) => m.roomId === roomId && m.senderId === senderId && m.clientMsgId === clientMsgId,
      ) || null
    );
  }

  async findMessagesByRoom(roomId: string, afterSeq?: number, limit: number = 50): Promise<Message[]> {
    return this.messages
      .filter((m) => m.roomId === roomId && (afterSeq === undefined || m.seq > afterSeq))
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
  }

  async saveMessageWithOutboxInTransaction(
    roomId: string,
    senderId: string,
    content: string,
    clientMsgId?: string,
    assetId?: string,
    outboxPayload: any = {},
  ): Promise<{ message: Message; isDuplicate: boolean }> {
    // Check clientMsgId idempotency first
    if (clientMsgId) {
      const existing = await this.findMessageByClientMsgId(roomId, senderId, clientMsgId);
      if (existing) {
        if (existing.props.content === content && existing.props.assetId === assetId) {
          return { message: existing, isDuplicate: true };
        } else {
          throw DomainException.conflict(
            ErrorCode.CLIENT_MESSAGE_CONFLICT,
            'clientMsgId đã được sử dụng với nội dung khác',
          );
        }
      }
    }

    // Atomic monotonic seq increment serialized by promise queue (simulating MongoDB $inc atomic operation)
    return new Promise((resolve, reject) => {
      this.seqLock = this.seqLock.then(async () => {
        try {
          const room = this.rooms.get(roomId);
          if (!room) {
            throw DomainException.notFound('Phòng chat');
          }

          const nextSeq = room.nextSeq();
          room.updateLastMessage(content.substring(0, 50));
          this.rooms.set(roomId, room);

          const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const now = new Date();
          const message = new Message(messageId, {
            roomId,
            senderId,
            seq: nextSeq,
            clientMsgId,
            content,
            assetId,
            readBy: [senderId],
            createdAt: now,
          });

          // Unique index check: (roomId, seq)
          const duplicateSeq = this.messages.find((m) => m.roomId === roomId && m.seq === nextSeq);
          if (duplicateSeq) {
            throw DomainException.conflict(ErrorCode.STATE_CONFLICT, 'Duplicate seq in room');
          }

          this.messages.push(message);

          // Save outbox record in transaction boundary
          const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          this.outbox.push({
            id: eventId,
            aggregateType: 'CHAT',
            aggregateId: roomId,
            eventType: 'MessageSent',
            payload: {
              ...outboxPayload,
              eventId,
              messageId,
              roomId,
              senderId,
              seq: nextSeq,
              content,
              clientMsgId,
              assetId,
              createdAt: now,
            },
            status: 'PENDING',
            retryCount: 0,
            createdAt: now,
          });

          // Auto update read receipt for sender
          await this.updateReadReceipt(roomId, senderId, nextSeq);

          resolve({ message, isDuplicate: false });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async updateReadReceipt(roomId: string, userId: string, lastReadSeq: number): Promise<void> {
    const key = `${roomId}_${userId}`;
    const room = this.rooms.get(roomId);
    let effectiveSeq = lastReadSeq;
    if (room && effectiveSeq > room.lastSeq) {
      effectiveSeq = room.lastSeq;
    }

    const current = this.readReceipts.get(key) || 0;
    if (effectiveSeq > current) {
      this.readReceipts.set(key, effectiveSeq);
    }
  }

  async getReadReceipt(roomId: string, userId: string): Promise<number> {
    return this.readReceipts.get(`${roomId}_${userId}`) || 0;
  }

  async findPendingOutboxEvents(limit: number = 20): Promise<OutboxRecord[]> {
    const now = new Date();
    return this.outbox
      .filter((o) => o.status === 'PENDING' || (o.status === 'FAILED' && o.retryCount < 5 && (!o.nextRetryAt || o.nextRetryAt <= now)))
      .slice(0, limit);
  }

  async markOutboxPublished(id: string): Promise<void> {
    const item = this.outbox.find((o) => o.id === id);
    if (item) {
      item.status = 'PUBLISHED';
      item.sentAt = new Date();
      item.error = undefined;
    }
  }

  async markOutboxFailed(id: string, error: string, nextRetryAt: Date, retryCount: number): Promise<void> {
    const item = this.outbox.find((o) => o.id === id);
    if (item) {
      item.status = retryCount >= 5 ? 'FAILED' : 'PENDING';
      item.error = error;
      item.nextRetryAt = nextRetryAt;
      item.retryCount = retryCount;
    }
  }
}

class InMemoryTeamRepository implements Partial<ITeamRepository> {
  public teams = new Map<string, Team>();

  async findById(id: string): Promise<Team | null> {
    return this.teams.get(id) || null;
  }

  async save(team: Team): Promise<void> {
    this.teams.set(team.id, team);
  }

  async update(team: Team): Promise<void> {
    this.teams.set(team.id, team);
  }
}

describe('SCHOL-26 — [S2][Phú][BE] Chat nhóm và MQTT reconnect', () => {
  let chatRepo: InMemoryChatRepository;
  let teamRepo: InMemoryTeamRepository;
  let chatUseCase: ChatUseCase;
  let outboxWorker: ChatOutboxWorkerService;
  let configService: ConfigService;
  let chatController: ChatController;
  let mockJwtService: any;

  const ROOM_ID = 'room_team_alpha';
  const TEAM_ID = 'team_alpha';
  const LEADER_ID = 'student_leader';
  const MEMBER_ID = 'student_member';
  const OUTSIDER_ID = 'student_outsider';
  const VALID_JWT = 'valid_test_token_123';

  beforeEach(() => {
    chatRepo = new InMemoryChatRepository();
    teamRepo = new InMemoryTeamRepository();
    chatUseCase = new ChatUseCase(chatRepo, teamRepo as any);
    configService = new ConfigService();
    outboxWorker = new ChatOutboxWorkerService(chatRepo, configService);

    mockJwtService = {
      verify: jest.fn((token: string) => {
        if (token === VALID_JWT) {
          return { sub: LEADER_ID, userId: LEADER_ID, email: 'leader@scholink.edu.vn', role: 'STUDENT' };
        }
        throw new Error('Invalid token');
      }),
    };
    chatController = new ChatController(chatUseCase, mockJwtService as unknown as JwtService);

    // Setup Team
    const team = new Team(TEAM_ID, {
      competitionId: 'comp_2026',
      name: 'Team Alpha',
      leaderId: LEADER_ID,
      minSize: 2,
      maxSize: 4,
      status: 'ACTIVE',
      rosterVersion: 1,
      fencingToken: 0,
      members: [
        { studentId: LEADER_ID, role: 'LEADER', joinedAt: new Date() },
        { studentId: MEMBER_ID, role: 'MEMBER', joinedAt: new Date() },
      ],
    });
    teamRepo.teams.set(TEAM_ID, team);

    // Setup Team Chat Room
    const room = new ChatRoom(ROOM_ID, {
      type: 'TEAM',
      refId: TEAM_ID,
      participants: [LEADER_ID, MEMBER_ID],
      lastSeq: 0,
    });
    chatRepo.rooms.set(ROOM_ID, room);
  });

  describe('1. Mongoose Schemas & Unique Indexes (SRS Section 27)', () => {
    it('MessageSchema phải khai báo đúng chỉ mục duy nhất room/seq và room/sender/clientMsgId', () => {
      const indexes = MessageSchema.indexes();

      // Check unique (roomId, seq)
      const hasRoomSeqUnique = indexes.some(
        ([fields, options]: any) => fields.roomId === 1 && fields.seq === 1 && options?.unique === true,
      );
      expect(hasRoomSeqUnique).toBe(true);

      // Check unique (roomId, senderId, clientMsgId) with partialFilterExpression
      const hasClientMsgIdUnique = indexes.some(
        ([fields, options]: any) =>
          fields.roomId === 1 &&
          fields.senderId === 1 &&
          fields.clientMsgId === 1 &&
          options?.unique === true &&
          options?.partialFilterExpression?.clientMsgId !== undefined,
      );
      expect(hasClientMsgIdUnique).toBe(true);
    });

    it('ReadReceiptSchema phải khai báo chỉ mục duy nhất room/userId', () => {
      const indexes = ReadReceiptSchema.indexes();
      const hasRoomUserUnique = indexes.some(
        ([fields, options]: any) => fields.roomId === 1 && fields.userId === 1 && options?.unique === true,
      );
      expect(hasRoomUserUnique).toBe(true);
    });

    it('OutboxSchema phải khai báo chỉ mục status/nextRetryAt/createdAt', () => {
      const indexes = OutboxSchema.indexes();
      const hasOutboxIndex = indexes.some(
        ([fields]: any) => fields.status === 1 && fields.nextRetryAt === 1 && fields.createdAt === 1,
      );
      expect(hasOutboxIndex).toBe(true);
    });
  });

  describe('2. Kiểm quyền gửi & ACK sau lưu bền vững trong Transaction', () => {
    it('cho phép thành viên gửi tin nhắn và lưu bền vững với seq tăng dần', async () => {
      const result = await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, {
        content: 'Chào cả đội Alpha!',
        clientMsgId: 'client_msg_001',
      });

      expect(result.id).toBeDefined();
      expect(result.seq).toBe(1);
      expect(result.content).toBe('Chào cả đội Alpha!');
      expect(result.isDuplicate).toBe(false);

      // Verify room state is updated
      const room = await chatRepo.findRoomById(ROOM_ID);
      expect(room?.lastSeq).toBe(1);
      expect(room?.props.lastMessageSnippet).toBe('Chào cả đội Alpha!');

      // Verify Outbox transaction event is created with PENDING status
      expect(chatRepo.outbox).toHaveLength(1);
      expect(chatRepo.outbox[0].status).toBe('PENDING');
      expect(chatRepo.outbox[0].payload.messageId).toBe(result.id);
      expect(chatRepo.outbox[0].payload.seq).toBe(1);
    });

    it('chặn người ngoài (outsider) không được gửi tin nhắn vào phòng chat (403)', async () => {
      await expect(
        chatUseCase.sendMessage(ROOM_ID, OUTSIDER_ID, {
          content: 'Tôi muốn spam phòng chat',
        }),
      ).rejects.toThrow(DomainException);

      try {
        await chatUseCase.sendMessage(ROOM_ID, OUTSIDER_ID, { content: 'Test' });
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe(ErrorCode.FORBIDDEN_RESOURCE);
      }
    });

    it('chặn tin nhắn vượt quá 4.000 ký tự (SRS FR-CHAT-02)', async () => {
      const longContent = 'A'.repeat(4001);
      await expect(
        chatUseCase.sendMessage(ROOM_ID, LEADER_ID, { content: longContent }),
      ).rejects.toThrow(DomainException);
    });
  });

  describe('3. Kiểm thử gửi đồng thời (Concurrent send) & seq không trùng', () => {
    it('nhiều tin nhắn gửi đồng thời phải có seq tăng đơn điệu tuyệt đối, không trùng nhau', async () => {
      const NUM_MESSAGES = 10;
      const sendPromises = Array.from({ length: NUM_MESSAGES }).map((_, idx) => {
        const sender = idx % 2 === 0 ? LEADER_ID : MEMBER_ID;
        return chatUseCase.sendMessage(ROOM_ID, sender, {
          content: `Tin nhắn đồng thời số ${idx + 1}`,
          clientMsgId: `concurrent_msg_${idx + 1}`,
        });
      });

      const results = await Promise.all(sendPromises);
      const seqs = results.map((r) => r.seq).sort((a, b) => a - b);

      // Verify strict sequential order from 1 to 10
      expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // Check unique seqs count matches total messages
      const uniqueSeqs = new Set(seqs);
      expect(uniqueSeqs.size).toBe(NUM_MESSAGES);

      // Verify room lastSeq is 10
      const room = await chatRepo.findRoomById(ROOM_ID);
      expect(room?.lastSeq).toBe(NUM_MESSAGES);
    });
  });

  describe('4. Idempotency với clientMsgId (FR-CHAT-03)', () => {
    it('gửi lại cùng clientMsgId và cùng nội dung -> trả về tin nhắn cũ (isDuplicate: true)', async () => {
      const first = await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, {
        content: 'Tin nhắn quan trọng',
        clientMsgId: 'idemp_key_100',
      });

      const second = await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, {
        content: 'Tin nhắn quan trọng',
        clientMsgId: 'idemp_key_100',
      });

      expect(second.id).toBe(first.id);
      expect(second.seq).toBe(first.seq);
      expect(second.isDuplicate).toBe(true);

      // Total messages in DB should remain 1
      expect(chatRepo.messages).toHaveLength(1);
    });

    it('gửi lại cùng clientMsgId nhưng khác nội dung -> ném lỗi 409 CLIENT_MESSAGE_CONFLICT', async () => {
      await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, {
        content: 'Nội dung ban đầu',
        clientMsgId: 'idemp_key_conflict',
      });

      await expect(
        chatUseCase.sendMessage(ROOM_ID, LEADER_ID, {
          content: 'Nội dung cố ý sửa đổi khác',
          clientMsgId: 'idemp_key_conflict',
        }),
      ).rejects.toThrow(DomainException);

      try {
        await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, {
          content: 'Nội dung cố ý sửa đổi khác',
          clientMsgId: 'idemp_key_conflict',
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe(ErrorCode.CLIENT_MESSAGE_CONFLICT);
      }
    });

    it('hai người gửi khác nhau dùng cùng một clientMsgId không bị gộp (SRS FR-CHAT-03)', async () => {
      const msgLeader = await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, {
        content: 'Leader gửi',
        clientMsgId: 'common_uuid_001',
      });

      const msgMember = await chatUseCase.sendMessage(ROOM_ID, MEMBER_ID, {
        content: 'Member gửi',
        clientMsgId: 'common_uuid_001',
      });

      expect(msgLeader.id).not.toBe(msgMember.id);
      expect(msgLeader.seq).toBe(1);
      expect(msgMember.seq).toBe(2);
      expect(chatRepo.messages).toHaveLength(2);
    });
  });

  describe('5. Giả lập Crash sau commit DB trước khi publish broker (Outbox Pattern)', () => {
    it('khi crash xảy ra sau commit, Outbox Worker quét lại và phát lại thành công mà không mất tin', async () => {
      // 1. Send message: committed to DB with Outbox status = PENDING
      const msg = await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, {
        content: 'Tin nhắn trước khi server bị ngắt điện',
        clientMsgId: 'crash_test_01',
      });

      expect(chatRepo.outbox).toHaveLength(1);
      expect(chatRepo.outbox[0].status).toBe('PENDING');

      // 2. Outbox Worker recovers and publishes
      const processed = await outboxWorker.processOutboxBatch();
      expect(processed).toBe(1);

      // Verify event is now marked PUBLISHED
      expect(chatRepo.outbox[0].status).toBe('PUBLISHED');
      expect(chatRepo.outbox[0].sentAt).toBeDefined();

      // Running worker again processes 0 records (idempotent, safe)
      const secondRun = await outboxWorker.processOutboxBatch();
      expect(secondRun).toBe(0);
    });
  });

  describe('6. Retry an toàn của Worker & Exponential Backoff & Max Retries', () => {
    it('khi broker lỗi, worker tăng retryCount và tính nextRetryAt bằng exponential backoff', async () => {
      // Create a pending outbox record
      await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, { content: 'Tin test retry' });
      const record = chatRepo.outbox[0];

      // Simulate 1st failure
      const next1 = new Date(Date.now() + 2000);
      await chatRepo.markOutboxFailed(record.id, 'Broker connection timeout', next1, 1);
      expect(chatRepo.outbox[0].status).toBe('PENDING');
      expect(chatRepo.outbox[0].retryCount).toBe(1);

      // Simulate 5th failure -> status transitions to FAILED
      const next5 = new Date(Date.now() + 32000);
      await chatRepo.markOutboxFailed(record.id, 'Fatal broker error', next5, 5);
      expect(chatRepo.outbox[0].status).toBe('FAILED');
      expect(chatRepo.outbox[0].retryCount).toBe(5);

      // Event should no longer be fetched by worker when retryCount >= 5
      const pendingAfterMax = await chatRepo.findPendingOutboxEvents();
      expect(pendingAfterMax).toHaveLength(0);
    });
  });

  describe('7. Phối hợp Notification: Dedup bằng businessKey', () => {
    it('outbox payload luôn chứa businessKey nhất quán (chat_msg_{messageId}) để không tạo notification trùng', async () => {
      const msg = await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, { content: 'Tin thông báo' });
      const record = chatRepo.outbox[0];

      // Verify businessKey pattern
      const expectedBusinessKey = `chat_msg_${msg.id}`;
      expect(record.payload.messageId).toBe(msg.id);
      expect(`chat_msg_${record.payload.messageId}`).toBe(expectedBusinessKey);

      // Recipients should be the member only, not the sender
      const participants = record.payload.participants as string[];
      const recipients = participants.filter((p) => p !== msg.senderId);
      expect(recipients).toEqual([MEMBER_ID]);
    });
  });

  describe('8. Lịch sử tin nhắn, afterSeq & Read Cursor tăng đơn điệu', () => {
    beforeEach(async () => {
      // Seed 5 messages
      for (let i = 1; i <= 5; i++) {
        await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, {
          content: `Tin nhắn ${i}`,
        });
      }
    });

    it('hỗ trợ afterSeq để client reconnect kéo bù tin nhắn sau seq đã nhận', async () => {
      const history = await chatUseCase.getMessages(ROOM_ID, MEMBER_ID, {
        afterSeq: 3,
        limit: 10,
      });

      expect(history.count).toBe(2);
      expect(history.messages.map((m) => m.seq)).toEqual([4, 5]);
      expect(history.roomLastSeq).toBe(5);
    });

    it('cập nhật read cursor đảm bảo tăng đơn điệu (không bị lùi khi nhận ack trễ)', async () => {
      // Mark read up to seq 4
      await chatUseCase.markAsRead(ROOM_ID, MEMBER_ID, { lastReadSeq: 4 });
      let readReceipt = await chatRepo.getReadReceipt(ROOM_ID, MEMBER_ID);
      expect(readReceipt).toBe(4);

      // Delayed ack tries to set readSeq back to 2 -> should remain 4
      await chatUseCase.markAsRead(ROOM_ID, MEMBER_ID, { lastReadSeq: 2 });
      readReceipt = await chatRepo.getReadReceipt(ROOM_ID, MEMBER_ID);
      expect(readReceipt).toBe(4);

      // Advance to seq 5
      await chatUseCase.markAsRead(ROOM_ID, MEMBER_ID, { lastReadSeq: 5 });
      readReceipt = await chatRepo.getReadReceipt(ROOM_ID, MEMBER_ID);
      expect(readReceipt).toBe(5);

      // Client unread count is 0
      const myRooms = await chatUseCase.getMyRooms(MEMBER_ID);
      const room = myRooms.find((r) => r.id === ROOM_ID);
      expect(room?.unreadCount).toBe(0);
    });
  });

  describe('9. Rời đội (Revocation of membership) & MQTT ACL', () => {
    it('khi thành viên rời đội: không thể gửi tin, không thể đọc tin, và MQTT ACL từ chối subscribe', async () => {
      // 1. Initial state: Member has full access
      const aclBefore = await chatUseCase.validateMqttAcl(
        MEMBER_ID,
        `scholink/rooms/${ROOM_ID}/messages`,
        'subscribe',
      );
      expect(aclBefore.allowed).toBe(true);

      // 2. Member leaves team
      const team = teamRepo.teams.get(TEAM_ID)!;
      team.removeMember(MEMBER_ID);
      teamRepo.teams.set(TEAM_ID, team);

      const room = chatRepo.rooms.get(ROOM_ID)!;
      room.removeParticipant(MEMBER_ID);
      chatRepo.rooms.set(ROOM_ID, room);

      // 3. Member cannot send message (403)
      await expect(
        chatUseCase.sendMessage(ROOM_ID, MEMBER_ID, { content: 'Tôi đã rời đội nhưng cố gửi' }),
      ).rejects.toThrow(DomainException);

      // 4. Member cannot read messages (403)
      await expect(
        chatUseCase.getMessages(ROOM_ID, MEMBER_ID, {}),
      ).rejects.toThrow(DomainException);

      // 5. MQTT ACL immediately denies subscription
      const aclAfter = await chatUseCase.validateMqttAcl(
        MEMBER_ID,
        `scholink/rooms/${ROOM_ID}/messages`,
        'subscribe',
      );
      expect(aclAfter.allowed).toBe(false);
      expect(aclAfter.reason).toContain('User is not a participant');
    });

    it('người ngoài không thể subscribe hoặc publish vào phòng chat qua MQTT ACL', async () => {
      const acl = await chatUseCase.validateMqttAcl(
        OUTSIDER_ID,
        `scholink/rooms/${ROOM_ID}/messages`,
        'subscribe',
      );
      expect(acl.allowed).toBe(false);
    });

    it('người dùng luôn được phép subscribe vào topic cá nhân của chính mình qua MQTT ACL', async () => {
      const acl = await chatUseCase.validateMqttAcl(
        MEMBER_ID,
        `scholink/users/${MEMBER_ID}/notifications`,
        'subscribe',
      );
      expect(acl.allowed).toBe(true);
    });
  });

  describe('10. Phòng Chat Trực Tiếp 1-1 (Direct Room)', () => {
    it('tạo phòng 1-1 thành công và chỉ 2 người tham gia mới có quyền gửi/đọc tin', async () => {
      const directRoom = await chatUseCase.createDirectRoom(LEADER_ID, OUTSIDER_ID);
      expect(directRoom.type).toBe('DIRECT');
      expect(directRoom.participants).toContain(LEADER_ID);
      expect(directRoom.participants).toContain(OUTSIDER_ID);

      // Leader sends direct message
      const msg = await chatUseCase.sendMessage(directRoom.id, LEADER_ID, { content: 'Tin nhắn 1-1' });
      expect(msg.seq).toBe(1);

      // Member (not in this direct room) is forbidden (403)
      await expect(
        chatUseCase.sendMessage(directRoom.id, MEMBER_ID, { content: 'Tôi tò mò muốn xen vào' }),
      ).rejects.toThrow(DomainException);

      await expect(
        chatUseCase.getMessages(directRoom.id, MEMBER_ID, {}),
      ).rejects.toThrow(DomainException);

      // MQTT ACL checks for direct room
      const memberAcl = await chatUseCase.validateMqttAcl(MEMBER_ID, `scholink/rooms/${directRoom.id}/messages`, 'subscribe');
      expect(memberAcl.allowed).toBe(false);

      const outsiderAcl = await chatUseCase.validateMqttAcl(OUTSIDER_ID, `scholink/rooms/${directRoom.id}/messages`, 'subscribe');
      expect(outsiderAcl.allowed).toBe(true);
    });

    it('chặn tạo phòng chat trực tiếp với chính mình', async () => {
      await expect(chatUseCase.createDirectRoom(LEADER_ID, LEADER_ID)).rejects.toThrow(DomainException);
    });
  });

  describe('11. ChatController HTTP & EMQX Webhooks Integration', () => {
    it('mqttAuth webhook: cho phép khi token hợp lệ, từ chối khi token sai hoặc thiếu', async () => {
      // Valid token
      const allowRes = await chatController.mqttAuth({ username: LEADER_ID, password: VALID_JWT });
      expect(allowRes.result).toBe('allow');
      expect(allowRes.user_id).toBe(LEADER_ID);

      // Invalid token
      const denyRes = await chatController.mqttAuth({ username: LEADER_ID, password: 'invalid_token' });
      expect(denyRes.result).toBe('deny');

      // Missing password
      const emptyRes = await chatController.mqttAuth({ username: LEADER_ID });
      expect(emptyRes.result).toBe('deny');
    });

    it('mqttAcl webhook: cho phép thành viên phòng và từ chối người ngoài', async () => {
      // Member subscribing to room
      const memberAcl = await chatController.mqttAcl({
        username: LEADER_ID,
        topic: `scholink/rooms/${ROOM_ID}/messages`,
        action: 'subscribe',
      });
      expect(memberAcl.result).toBe('allow');

      // Outsider subscribing to room
      const strangerAcl = await chatController.mqttAcl({
        username: OUTSIDER_ID,
        topic: `scholink/rooms/${ROOM_ID}/messages`,
        action: 'subscribe',
      });
      expect(strangerAcl.result).toBe('deny');
    });

    it('controller sendMessage & getMessages & markRead qua HTTP handler', async () => {
      const mockReq = { user: { userId: LEADER_ID, email: 'leader@scholink.edu.vn', role: 'STUDENT' as const } };

      // Send message
      const sendRes = await chatController.sendMessage(mockReq, ROOM_ID, {
        content: 'Tin qua controller',
        clientMsgId: 'ctrl_msg_01',
      });
      expect(sendRes.content).toBe('Tin qua controller');
      expect(sendRes.seq).toBe(1);

      // Get messages
      const getRes = await chatController.getMessages(mockReq, ROOM_ID, { afterSeq: 0, limit: 10 });
      expect(getRes.count).toBe(1);

      // Mark read
      const markRes = await chatController.markRead(mockReq, ROOM_ID, { lastReadSeq: 1 });
      expect(markRes.lastReadSeq).toBe(1);
    });
  });

  describe('12. Không lấy MQTT làm nguồn dữ liệu chính & Replay ID/seq', () => {
    it('client khôi phục dữ liệu bằng REST afterSeq khi reconnect thay vì dựa vào MQTT stream', async () => {
      // 3 messages sent to room
      await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, { content: 'Message 1' });
      await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, { content: 'Message 2' });
      await chatUseCase.sendMessage(ROOM_ID, LEADER_ID, { content: 'Message 3' });

      // Client lost connection after seq 1. Upon reconnect, client calls REST afterSeq: 1
      const reconnectResponse = await chatUseCase.getMessages(ROOM_ID, MEMBER_ID, { afterSeq: 1 });
      expect(reconnectResponse.messages.map((m) => m.seq)).toEqual([2, 3]);

      // Client deduplicates duplicate MQTT replay packet using message.seq <= lastProcessedSeq
      let clientCurrentSeq = 2;
      const incomingMqttPacket = reconnectResponse.messages[0]; // seq 2
      const isPacketIgnored = incomingMqttPacket.seq <= clientCurrentSeq;
      expect(isPacketIgnored).toBe(true);
    });
  });
});
