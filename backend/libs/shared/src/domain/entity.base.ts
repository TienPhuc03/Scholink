export interface DomainEvent {
  readonly eventName: string;
  readonly occurredOn: Date;
  readonly aggregateId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export abstract class Entity<TId = string> {
  protected readonly _id: TId;
  protected _version: number;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;

  constructor(
    id: TId,
    version: number = 1,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
  ) {
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

  public equals(other?: Entity<TId>): boolean {
    if (!other || !(other instanceof Entity)) {
      return false;
    }
    return this._id === other._id;
  }
}

export abstract class AggregateRoot<TId = string> extends Entity<TId> {
  private _domainEvents: DomainEvent[] = [];

  constructor(
    id: TId,
    version: number = 1,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date(),
    domainEvents: readonly DomainEvent[] = [],
  ) {
    super(id, version, createdAt, updatedAt);
    this._domainEvents = [...domainEvents];
  }

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }

  protected addDomainEvent(domainEvent: DomainEvent): void {
    this._domainEvents.push(domainEvent);
  }

  public clearDomainEvents(): void {
    this._domainEvents = [];
  }
}

export abstract class ValueObject<TProps extends Record<string, any>> {
  protected readonly props: Readonly<TProps>;

  constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  public equals(vo?: ValueObject<TProps>): boolean {
    if (!vo || vo.props === undefined) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(vo.props);
  }
}
