import { AggregateRoot, DomainException, ErrorCode } from '@shared';

export interface WalletProps {
  userId: string;
  balanceVnd: number;
  heldVnd: number;
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
}

export class Wallet extends AggregateRoot<string> {
  private _props: WalletProps;

  constructor(id: string, props: WalletProps) {
    super(id, props.version || 1, props.createdAt || new Date(), props.updatedAt || new Date());
    this._props = props;
  }

  get userId(): string {
    return this._props.userId;
  }

  get balanceVnd(): number {
    return this._props.balanceVnd;
  }

  get heldVnd(): number {
    return this._props.heldVnd;
  }

  get availableVnd(): number {
    return this._props.balanceVnd - this._props.heldVnd;
  }

  public credit(amountVnd: number): void {
    if (amountVnd <= 0) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, 'Số tiền nạp phải lớn hơn 0', 400);
    }
    this._props.balanceVnd += amountVnd;
    this.incrementVersion();
  }

  public hold(amountVnd: number): void {
    if (amountVnd > this.availableVnd) {
      throw new DomainException(ErrorCode.INSUFFICIENT_FUNDS, 'Số dư khả dụng không đủ', 422);
    }
    this._props.heldVnd += amountVnd;
    this.incrementVersion();
  }

  public capture(amountVnd: number): void {
    if (amountVnd > this._props.heldVnd) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Số tiền capture vượt quá số tiền đang hold', 409);
    }
    this._props.heldVnd -= amountVnd;
    this._props.balanceVnd -= amountVnd;
    this.incrementVersion();
  }

  public release(amountVnd: number): void {
    if (amountVnd > this._props.heldVnd) {
      throw new DomainException(ErrorCode.STATE_CONFLICT, 'Số tiền release vượt quá số tiền đang hold', 409);
    }
    this._props.heldVnd -= amountVnd;
    this.incrementVersion();
  }
}
