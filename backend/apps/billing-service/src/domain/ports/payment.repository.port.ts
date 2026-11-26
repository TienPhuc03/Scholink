import { PaymentOrder } from '../payment.entity';

export interface IPaymentRepository {
  findById(id: string): Promise<PaymentOrder | null>;
  findByOrderCode(orderCode: number): Promise<PaymentOrder | null>;
  save(order: PaymentOrder): Promise<void>;
  update(order: PaymentOrder): Promise<void>;
  /** Atomically transitions PENDING -> SUCCEEDED; returns true only for the winning caller. */
  markSucceededIfPending?(orderId: string, session?: unknown): Promise<boolean>;
  /** Atomically transitions PENDING -> terminal non-credit status. */
  markStatusIfPending?(
    orderId: string,
    nextStatus: 'FAILED' | 'CANCELLED' | 'EXPIRED',
    session?: unknown,
  ): Promise<boolean>;
  /** Finds PENDING orders created before [olderThanDate] for reconciliation. */
  findPendingOrders?(olderThanDate: Date, limit?: number): Promise<PaymentOrder[]>;
}

export const PAYMENT_REPOSITORY = 'PAYMENT_REPOSITORY';
