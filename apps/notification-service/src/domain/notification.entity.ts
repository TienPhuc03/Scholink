import { Entity } from '@shared';

export type NotificationType =
  | 'DEADLINE_REMINDER'
  | 'APPLICATION_UPDATE'
  | 'TEAM_INVITE'
  | 'MATCH_SUGGESTION'
  | 'SYSTEM';

export interface NotificationProps {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  refUrl?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt?: Date;
}

export class Notification extends Entity<string> {
  private _props: NotificationProps;

  constructor(id: string, props: NotificationProps) {
    super(id, 1, props.createdAt || new Date(), props.createdAt || new Date());
    this._props = props;
  }

  get userId(): string {
    return this._props.userId;
  }

  get isRead(): boolean {
    return this._props.isRead;
  }

  get props(): Readonly<NotificationProps> {
    return this._props;
  }

  public markAsRead(): void {
    this._props.isRead = true;
    this._props.readAt = new Date();
  }
}
