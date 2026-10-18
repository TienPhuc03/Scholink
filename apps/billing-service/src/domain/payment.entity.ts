import { AggregateRoot } from '@shared';

export type PaymentStatus = 'CREATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';

export interface PaymentOrderProps {
  userId: string;
  amountVnd: number;
  provider: string;
  checkoutUrl?: string;
  status: PaymentStatus;
  idempotencyKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export class PaymentOrder extends AggregateRoot<string> {
  private _props: PaymentOrderProps;

  constructor(id: string, props: PaymentOrderProps) {
    super(id, props.version || 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = props;
  }

  get userId(): string {
    return this._props.userId;
  }

  get amountVnd(): number {
    return this._props.amountVnd;
  }

  get status(): PaymentStatus {
    return this._props.status;
  }

  get props(): Readonly<PaymentOrderProps> {
    return this._props;
  }

  public markSucceeded(): void {
    this._props.status = 'SUCCEEDED';
    this.incrementVersion();
  }

  public markFailed(): void {
    this._props.status = 'FAILED';
    this.incrementVersion();
  }
}
