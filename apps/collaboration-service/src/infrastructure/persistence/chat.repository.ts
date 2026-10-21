import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IChatRepository } from '../../domain/ports/chat.repository.port';
import { ChatRoom, Message } from '../../domain/chat.entity';
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
  constructor(
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

  async atomicNextSeq(roomId: string, snippet: string): Promise<number> {
    const updated = await this.roomModel.findOneAndUpdate(
      { id: roomId },
      {
        $inc: { lastSeq: 1, version: 1 },
        $set: {
          lastMessageSnippet: snippet.substring(0, 50),
          lastMessageAt: new Date(),
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new Error(`ChatRoom ${roomId} not found`);
    }

    return updated.lastSeq;
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

  async saveMessageWithOutbox(message: Message, outboxPayload: any): Promise<void> {
    // Save Message
    await this.messageModel.create({
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      seq: message.seq,
      clientMsgId: message.clientMsgId,
      content: message.props.content,
      assetId: message.props.assetId,
      readBy: message.props.readBy,
      createdAt: message.createdAt,
    });

    // Save Outbox Event for reliable event distribution
    await this.outboxModel.create({
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      aggregateType: 'CHAT',
      aggregateId: message.roomId,
      eventType: 'MessageSent',
      payload: {
        ...outboxPayload,
        messageId: message.id,
        roomId: message.roomId,
        senderId: message.senderId,
        seq: message.seq,
        createdAt: message.createdAt,
      },
      status: 'PENDING',
    });
  }

  async updateReadReceipt(roomId: string, userId: string, lastReadSeq: number): Promise<void> {
    await this.receiptModel.updateOne(
      { roomId, userId },
      {
        $max: { lastReadSeq: lastReadSeq },
        $set: { readAt: new Date() },
      },
      { upsert: true },
    );
  }

  async getReadReceipt(roomId: string, userId: string): Promise<number> {
    const doc = await this.receiptModel.findOne({ roomId, userId }).exec();
    return doc ? doc.lastReadSeq : 0;
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
