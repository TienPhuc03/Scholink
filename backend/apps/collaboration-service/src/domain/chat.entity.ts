import { AggregateRoot, Entity } from '@shared';

export interface MessageProps {
  roomId: string;
  senderId: string;
  seq: number;
  clientMsgId?: string;
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

  get roomId(): string {
    return this._props.roomId;
  }

  get senderId(): string {
    return this._props.senderId;
  }

  get seq(): number {
    return this._props.seq;
  }

  get clientMsgId(): string | undefined {
    return this._props.clientMsgId;
  }

  get props(): Readonly<MessageProps> {
    return this._props;
  }
}

export interface ChatRoomProps {
  type: 'DIRECT' | 'TEAM';
  refId?: string;
  participants: string[];
  lastSeq: number;
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
    this._props = {
      ...props,
      lastSeq: props.lastSeq || 0,
    };
  }

  get type(): 'DIRECT' | 'TEAM' {
    return this._props.type;
  }

  get refId(): string | undefined {
    return this._props.refId;
  }

  get participants(): ReadonlyArray<string> {
    return this._props.participants;
  }

  get lastSeq(): number {
    return this._props.lastSeq;
  }

  get props(): Readonly<ChatRoomProps> {
    return this._props;
  }

  public nextSeq(): number {
    this._props.lastSeq += 1;
    this.incrementVersion();
    return this._props.lastSeq;
  }

  public updateLastMessage(snippet: string): void {
    this._props.lastMessageSnippet = snippet;
    this._props.lastMessageAt = new Date();
  }

  public addParticipant(userId: string): void {
    if (!this._props.participants.includes(userId)) {
      this._props.participants.push(userId);
      this.incrementVersion();
    }
  }

  public removeParticipant(userId: string): void {
    this._props.participants = this._props.participants.filter((p) => p !== userId);
    this.incrementVersion();
  }
}

export interface OutboxEventProps {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, any>;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  createdAt?: Date;
}
