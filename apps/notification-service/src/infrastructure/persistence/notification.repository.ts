import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { INotificationRepository } from '../../domain/ports/notification.repository.port';
import { Notification, NotificationType } from '../../domain/notification.entity';
import { NotificationModel, NotificationDocument } from './notification.schema';

@Injectable()
export class MongooseNotificationRepository implements INotificationRepository {
  constructor(
    @InjectModel(NotificationModel.name) private readonly model: Model<NotificationDocument>,
  ) {}

  async findById(id: string): Promise<Notification | null> {
    const doc = await this.model.findOne({ id }).exec();
    if (!doc) return null;
    return new Notification(doc.id, {
      userId: doc.userId,
      type: doc.type as NotificationType,
      title: doc.title,
      body: doc.body,
      refUrl: doc.refUrl,
      isRead: doc.isRead,
      readAt: doc.readAt,
      createdAt: (doc as any).createdAt,
    });
  }

  async findManyByUserId(userId: string, limit: number = 20): Promise<Notification[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return docs.map(
      (doc) =>
        new Notification(doc.id, {
          userId: doc.userId,
          type: doc.type as NotificationType,
          title: doc.title,
          body: doc.body,
          refUrl: doc.refUrl,
          isRead: doc.isRead,
          readAt: doc.readAt,
          createdAt: (doc as any).createdAt,
        }),
    );
  }

  async save(notification: Notification): Promise<void> {
    await this.model.create({
      id: notification.id,
      userId: notification.userId,
      type: notification.props.type,
      title: notification.props.title,
      body: notification.props.body,
      refUrl: notification.props.refUrl,
      isRead: notification.isRead,
    });
  }

  async update(notification: Notification): Promise<void> {
    await this.model
      .updateOne(
        { id: notification.id },
        {
          isRead: notification.isRead,
          readAt: notification.props.readAt,
        },
      )
      .exec();
  }

  async markAllRead(userId: string): Promise<void> {
    await this.model
      .updateMany(
        { userId, isRead: false },
        {
          isRead: true,
          readAt: new Date(),
        },
      )
      .exec();
  }
}
