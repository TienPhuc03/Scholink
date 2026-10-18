import { Notification } from '../notification.entity';

export interface INotificationRepository {
  findById(id: string): Promise<Notification | null>;
  findManyByUserId(userId: string, limit?: number): Promise<Notification[]>;
  save(notification: Notification): Promise<void>;
  update(notification: Notification): Promise<void>;
  markAllRead(userId: string): Promise<void>;
}

export const NOTIFICATION_REPOSITORY = 'NOTIFICATION_REPOSITORY';
