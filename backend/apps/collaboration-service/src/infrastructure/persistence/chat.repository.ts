import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IChatRepository } from '../../domain/ports/chat.repository.port';
import { ChatRoom, Message } from '../../domain/chat.entity';
import { ChatRoomModel, ChatRoomDocument, MessageModel, MessageDocument } from './chat.schema';

@Injectable()
export class MongooseChatRepository implements IChatRepository {
  constructor(
    @InjectModel(ChatRoomModel.name) private readonly roomModel: Model<ChatRoomDocument>,
    @InjectModel(MessageModel.name) private readonly messageModel: Model<MessageDocument>,
  ) {}

  async findRoomById(id: string): Promise<ChatRoom | null> {
    const doc = await this.roomModel.findOne({ id }).exec();
    if (!doc) return null;
    return new ChatRoom(doc.id, {
      type: doc.type as any,
      refId: doc.refId,
      participants: doc.participants,
      lastMessageSnippet: doc.lastMessageSnippet,
      lastMessageAt: doc.lastMessageAt,
      version: doc.version,
    });
  }

  async findRoomsByUser(userId: string): Promise<ChatRoom[]> {
    const docs = await this.roomModel.find({ participants: userId }).sort({ lastMessageAt: -1 }).exec();
    return docs.map(
      (doc) =>
        new ChatRoom(doc.id, {
          type: doc.type as any,
          refId: doc.refId,
          participants: doc.participants,
          lastMessageSnippet: doc.lastMessageSnippet,
          lastMessageAt: doc.lastMessageAt,
          version: doc.version,
        }),
    );
  }

  async saveRoom(room: ChatRoom): Promise<void> {
    await this.roomModel.create({
      id: room.id,
      type: room.props.type,
      refId: room.props.refId,
      participants: room.participants,
      version: room.version,
    });
  }

  async updateRoom(room: ChatRoom): Promise<void> {
    await this.roomModel
      .updateOne(
        { id: room.id },
        {
          lastMessageSnippet: room.props.lastMessageSnippet,
          lastMessageAt: room.props.lastMessageAt,
          version: room.version,
        },
      )
      .exec();
  }

  async findMessagesByRoom(roomId: string, limit: number = 50): Promise<Message[]> {
    const docs = await this.messageModel
      .find({ roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return docs.reverse().map(
      (d) =>
        new Message(d.id, {
          roomId: d.roomId,
          senderId: d.senderId,
          content: d.content,
          assetId: d.assetId,
          readBy: d.readBy,
          createdAt: (d as any).createdAt,
        }),
    );
  }

  async saveMessage(message: Message): Promise<void> {
    await this.messageModel.create({
      id: message.id,
      roomId: message.props.roomId,
      senderId: message.props.senderId,
      content: message.props.content,
      assetId: message.props.assetId,
      readBy: message.props.readBy,
    });
  }
}
