import { AggregateRoot, Entity } from '@shared';

export interface MessageProps {
  roomId: string;
  senderId: string;
  content: string;
  assetId?: string;
  readBy: string[];
  createdAt?: Date;
}

export class Message extends Entity<string> {
  private _props: MessageProps;

  constructor(id: string, props: MessageProps) {
    super(id, 1, props.createdAt || new Date(), props.createdAt || new Date());
    this._props = props;
  }

  get props(): Readonly<MessageProps> {
    return this._props;
  }
}

export interface ChatRoomProps {
  type: 'DIRECT' | 'TEAM';
  refId?: string;
  participants: string[];
  lastMessageSnippet?: string;
  lastMessageAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export class ChatRoom extends AggregateRoot<string> {
  private _props: ChatRoomProps;

  constructor(id: string, props: ChatRoomProps) {
    super(id, props.version || 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = props;
  }

  get participants(): ReadonlyArray<string> {
    return this._props.participants;
  }

  get props(): Readonly<ChatRoomProps> {
    return this._props;
  }

  public updateLastMessage(snippet: string): void {
    this._props.lastMessageSnippet = snippet;
    this._props.lastMessageAt = new Date();
    this.incrementVersion();
  }
}
