import { Injectable, Logger } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import * as crypto from 'crypto';
import { IChatRepository, OutboxRecord } from '../../domain/ports/chat.repository.port';
import { ChatRoom, Message } from '../../domain/chat.entity';
import { DomainException, ErrorCode } from '@shared';
import {
  ChatRoomModel,
  ChatRoomDocument,
  MessageModel,
  MessageDocument,
  OutboxModel,
  OutboxDocument,
  ReadReceiptModel,
  ReadReceiptDocument,
} from './chat.schema';

@Injectable()
export class MongooseChatRepository implements IChatRepository {
  private readonly logger = new Logger(MongooseChatRepository.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(ChatRoomModel.name) private readonly roomModel: Model<ChatRoomDocument>,
    @InjectModel(MessageModel.name) private readonly messageModel: Model<MessageDocument>,
    @InjectModel(OutboxModel.name) private readonly outboxModel: Model<OutboxDocument>,
    @InjectModel(ReadReceiptModel.name) private readonly receiptModel: Model<ReadReceiptDocument>,
  ) {}

  async findRoomById(id: string): Promise<ChatRoom | null> {
    const doc = await this.roomModel.findOne({ id }).exec();
    if (!doc) return null;
    return this.toRoomDomain(doc);
  }

  async findRoomByRefId(refId: string): Promise<ChatRoom | null> {
    const doc = await this.roomModel.findOne({ refId }).exec();
    if (!doc) return null;
    return this.toRoomDomain(doc);
  }

  async findRoomsByUser(userId: string): Promise<ChatRoom[]> {
    const docs = await this.roomModel.find({ participants: userId }).sort({ lastMessageAt: -1 }).exec();
    return docs.map((d) => this.toRoomDomain(d));
  }

  async saveRoom(room: ChatRoom): Promise<void> {
    await this.roomModel.create({
      id: room.id,
      type: room.type,
      refId: room.refId,
      participants: room.participants as any,
      lastSeq: room.lastSeq,
      lastMessageSnippet: room.props.lastMessageSnippet,
      lastMessageAt: room.props.lastMessageAt,
      version: room.version,
    });
  }

  async updateRoom(room: ChatRoom): Promise<void> {
    await this.roomModel
      .updateOne(
        { id: room.id },
        {
          participants: room.participants as any,
          lastSeq: room.lastSeq,
          lastMessageSnippet: room.props.lastMessageSnippet,
          lastMessageAt: room.props.lastMessageAt,
          version: room.version,
        },
      )
      .exec();
  }

  async findMessageByClientMsgId(roomId: string, senderId: string, clientMsgId: string): Promise<Message | null> {
    const doc = await this.messageModel.findOne({ roomId, senderId, clientMsgId }).exec();
    if (!doc) return null;
    return this.toMessageDomain(doc);
  }

  async findMessagesByRoom(roomId: string, afterSeq?: number, limit: number = 50): Promise<Message[]> {
    const query: any = { roomId };
    if (afterSeq !== undefined && afterSeq > 0) {
      query.seq = { $gt: afterSeq };
    }

    const docs = await this.messageModel.find(query).sort({ seq: 1 }).limit(limit).exec();
    return docs.map((d) => this.toMessageDomain(d));
  }

  async saveMessageWithOutboxInTransaction(
    roomId: string,
    senderId: string,
    content: string,
    clientMsgId?: string,
    assetId?: string,
    outboxPayload: any = {},
  ): Promise<{ message: Message; isDuplicate: boolean }> {
    // 1. Idempotency pre-check
    if (clientMsgId) {
      const existing = await this.findMessageByClientMsgId(roomId, senderId, clientMsgId);
      if (existing) {
        if (existing.props.content === content && existing.props.assetId === assetId) {
          this.logger.log(`[ChatDedup] Idempotent hit: clientMsgId=${clientMsgId}`);
          return { message: existing, isDuplicate: true };
        } else {
          throw DomainException.conflict(
            ErrorCode.CLIENT_MESSAGE_CONFLICT,
            'clientMsgId đã được sử dụng với nội dung khác',
          );
        }
      }
    }

    // 2. Try session/transaction (works on replica sets) with fallback if standalone
    let session: any = null;
    try {
      session = await this.connection.startSession();
      session.startTransaction();
    } catch {
      session = null;
    }

    try {
      const sessionOpt = session ? { session } : {};

      // Atomic increment lastSeq on room
      const updatedRoom = await this.roomModel.findOneAndUpdate(
        { id: roomId },
        {
          $inc: { lastSeq: 1, version: 1 },
          $set: {
            lastMessageSnippet: content.substring(0, 50),
            lastMessageAt: new Date(),
          },
        },
        { new: true, ...sessionOpt },
      );

      if (!updatedRoom) {
        throw DomainException.notFound('Phòng chat');
      }

      const nextSeq = updatedRoom.lastSeq;
      const messageId = `msg_${crypto.randomUUID()}`;
      const now = new Date();

      // Create message document
      const createdMsgDocs = await this.messageModel.create(
        [
          {
            id: messageId,
            roomId,
            senderId,
            seq: nextSeq,
            clientMsgId,
            content,
            assetId,
            readBy: [senderId],
            createdAt: now,
          },
        ],
        sessionOpt,
      );
      const createdMsg = createdMsgDocs[0];

      // Create Outbox record for reliable event distribution
      const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await this.outboxModel.create(
        [
          {
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
          },
        ],
        sessionOpt,
      );

      // Auto update read receipt for sender
      await this.receiptModel.updateOne(
        { roomId, userId: senderId },
        {
          $max: { lastReadSeq: nextSeq },
          $set: { readAt: now },
        },
        { upsert: true, ...sessionOpt },
      );

      if (session) {
        await session.commitTransaction();
      }

      return {
        message: this.toMessageDomain(createdMsg),
        isDuplicate: false,
      };
    } catch (err: any) {
      if (session) {
        await session.abortTransaction().catch(() => {});
      }

      // Handle duplicate key error in race condition
      if (err.code === 11000) {
        if (clientMsgId && err.keyPattern && err.keyPattern.clientMsgId) {
          const existing = await this.findMessageByClientMsgId(roomId, senderId, clientMsgId);
          if (existing) {
            if (existing.props.content === content && existing.props.assetId === assetId) {
              return { message: existing, isDuplicate: true };
            }
            throw DomainException.conflict(
              ErrorCode.CLIENT_MESSAGE_CONFLICT,
              'clientMsgId đã được sử dụng với nội dung khác',
            );
          }
        }
        if (err.keyPattern && err.keyPattern.seq) {
          throw DomainException.conflict(ErrorCode.STATE_CONFLICT, 'Xung đột thứ tự tin nhắn (seq), vui lòng thử lại');
        }
      }

      throw err;
    } finally {
      if (session) {
        await session.endSession().catch(() => {});
      }
    }
  }

  async updateReadReceipt(roomId: string, userId: string, lastReadSeq: number): Promise<void> {
    const room = await this.roomModel.findOne({ id: roomId }).exec();
    let effectiveSeq = lastReadSeq;
    if (room && effectiveSeq > room.lastSeq) {
      effectiveSeq = room.lastSeq;
    }

    await this.receiptModel.updateOne(
      { roomId, userId },
      {
        $max: { lastReadSeq: effectiveSeq },
        $set: { readAt: new Date() },
      },
      { upsert: true },
    );
  }

  async getReadReceipt(roomId: string, userId: string): Promise<number> {
    const doc = await this.receiptModel.findOne({ roomId, userId }).exec();
    return doc ? doc.lastReadSeq : 0;
  }

  async findPendingOutboxEvents(limit: number = 20): Promise<OutboxRecord[]> {
    const now = new Date();
    const docs = await this.outboxModel
      .find({
        $or: [
          { status: 'PENDING' },
          { status: 'FAILED', retryCount: { $lt: 5 }, nextRetryAt: { $lte: now } },
        ],
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();

    return docs.map((d) => ({
      id: d.id,
      aggregateType: d.aggregateType,
      aggregateId: d.aggregateId,
      eventType: d.eventType,
      payload: d.payload,
      status: d.status,
      retryCount: d.retryCount,
      nextRetryAt: d.nextRetryAt,
      error: d.error,
      sentAt: d.sentAt,
      createdAt: d.createdAt,
    }));
  }

  async markOutboxPublished(id: string): Promise<void> {
    await this.outboxModel.updateOne(
      { id },
      {
        $set: {
          status: 'PUBLISHED',
          sentAt: new Date(),
          error: undefined,
        },
      },
    );
  }

  async markOutboxFailed(id: string, error: string, nextRetryAt: Date, retryCount: number): Promise<void> {
    await this.outboxModel.updateOne(
      { id },
      {
        $set: {
          status: retryCount >= 5 ? 'FAILED' : 'PENDING',
          error,
          nextRetryAt,
          retryCount,
        },
      },
    );
  }

  private toRoomDomain(doc: ChatRoomDocument): ChatRoom {
    return new ChatRoom(doc.id, {
      type: doc.type as any,
      refId: doc.refId,
      participants: doc.participants,
      lastSeq: doc.lastSeq || 0,
      lastMessageSnippet: doc.lastMessageSnippet,
      lastMessageAt: doc.lastMessageAt,
      version: doc.version,
    });
  }

  private toMessageDomain(doc: MessageDocument): Message {
    return new Message(doc.id, {
      roomId: doc.roomId,
      senderId: doc.senderId,
      seq: doc.seq,
      clientMsgId: doc.clientMsgId,
      content: doc.content,
      assetId: doc.assetId,
      readBy: doc.readBy,
      createdAt: doc.createdAt,
    });
  }
}
