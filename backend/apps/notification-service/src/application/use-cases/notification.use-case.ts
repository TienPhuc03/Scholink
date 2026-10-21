import { Injectable, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { INotificationRepository, NOTIFICATION_REPOSITORY } from '../../domain/ports/notification.repository.port';
import { Notification, NotificationType } from '../../domain/notification.entity';
import { DomainException } from '@shared';

@Injectable()
export class NotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
  ) {}

  async getMyNotifications(userId: string) {
    const list = await this.notificationRepo.findManyByUserId(userId);
    return list.map((n) => ({ ...n.props, id: n.id }));
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.notificationRepo.findById(notificationId);
    if (!notification) {
      throw DomainException.notFound('Thông báo');
    }

    if (notification.userId !== userId) {
      throw DomainException.forbidden();
    }

    notification.markAsRead();
    await this.notificationRepo.update(notification);

    return { id: notification.id, isRead: notification.isRead };
  }

  async markAllRead(userId: string) {
    await this.notificationRepo.markAllRead(userId);
    return { success: true };
  }

  async send(userId: string, type: NotificationType, title: string, body: string, refUrl?: string) {
    const notification = new Notification(crypto.randomUUID(), {
      userId,
      type,
      title,
      body,
      refUrl,
      isRead: false,
    });

    await this.notificationRepo.save(notification);
    return notification.props;
  }
}
