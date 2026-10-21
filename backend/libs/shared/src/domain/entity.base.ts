export interface DomainEvent {
  eventName: string;
  occurredOn: Date;
  aggregateId: string;
  payload: Record<string, any>;
}

export abstract class Entity<TId = string> {
  protected readonly _id: TId;
  protected _version: number;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;

  constructor(id: TId, version: number = 1, createdAt: Date = new Date(), updatedAt: Date = new Date()) {
    this._id = id;
    this._version = version;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  get id(): TId {
    return this._id;
  }

  get version(): number {
    return this._version;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  public incrementVersion(): void {
    this._version += 1;
    this._updatedAt = new Date();
  }

  public equals(object?: Entity<TId>): boolean {
    if (object == null || object === undefined) {
      return false;
    }
    if (this === object) {
      return true;
    }
    if (!(object instanceof Entity)) {
      return false;
    }
    return this._id === object._id;
  }
}

export abstract class AggregateRoot<TId = string> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = [];

  get domainEvents(): DomainEvent[] {
    return [...this._domainEvents];
  }

  protected addDomainEvent(domainEvent: DomainEvent): void {
    this._domainEvents.push(domainEvent);
  }

  public clearDomainEvents(): void {
    this._domainEvents = [];
  }
}

export abstract class ValueObject<TProps> {
  protected readonly props: TProps;

  constructor(props: TProps) {
    this.props = Object.freeze(props);
  }

  public equals(vo?: ValueObject<TProps>): boolean {
    if (vo === null || vo === undefined) {
      return false;
    }
    if (vo.props === undefined) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(vo.props);
  }
}
