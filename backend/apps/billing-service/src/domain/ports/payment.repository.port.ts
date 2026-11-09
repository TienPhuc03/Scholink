import { PaymentOrder } from '../payment.entity';

export interface IPaymentRepository {
  findById(id: string): Promise<PaymentOrder | null>;
  save(order: PaymentOrder): Promise<void>;
  update(order: PaymentOrder): Promise<void>;
}

export const PAYMENT_REPOSITORY = 'PAYMENT_REPOSITORY';
