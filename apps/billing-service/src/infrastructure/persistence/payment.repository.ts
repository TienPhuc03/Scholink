import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IPaymentRepository } from '../../domain/ports/payment.repository.port';
import { PaymentOrder, PaymentStatus } from '../../domain/payment.entity';
import { PaymentOrderModel, PaymentOrderDocument } from './payment.schema';

@Injectable()
export class MongoosePaymentRepository implements IPaymentRepository {
  constructor(
    @InjectModel(PaymentOrderModel.name) private readonly model: Model<PaymentOrderDocument>,
  ) {}

  async findById(id: string): Promise<PaymentOrder | null> {
    const doc = await this.model.findOne({ id }).exec();
    if (!doc) return null;
    return new PaymentOrder(doc.id, {
      userId: doc.userId,
      amountVnd: doc.amountVnd,
      provider: doc.provider,
      checkoutUrl: doc.checkoutUrl,
      status: doc.status as PaymentStatus,
      idempotencyKey: doc.idempotencyKey,
      version: doc.version,
    });
  }

  async save(order: PaymentOrder): Promise<void> {
    await this.model.create({
      id: order.id,
      userId: order.userId,
      amountVnd: order.amountVnd,
      provider: order.props.provider,
      checkoutUrl: order.props.checkoutUrl,
      status: order.status,
      idempotencyKey: order.props.idempotencyKey,
      version: order.version,
    });
  }

  async update(order: PaymentOrder): Promise<void> {
    await this.model
      .updateOne(
        { id: order.id },
        {
          status: order.status,
          version: order.version,
        },
      )
      .exec();
  }
}
