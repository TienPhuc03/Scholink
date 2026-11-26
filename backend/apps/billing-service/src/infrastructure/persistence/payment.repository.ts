import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
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
      orderCode: doc.orderCode,
      checkoutUrl: doc.checkoutUrl,
      qrCode: doc.qrCode,
      status: doc.status as PaymentStatus,
      idempotencyKey: doc.idempotencyKey,
      version: doc.version,
    });
  }

  async findByOrderCode(orderCode: number): Promise<PaymentOrder | null> {
    const doc = await this.model.findOne({ orderCode }).exec();
    if (!doc) return null;
    return new PaymentOrder(doc.id, {
      userId: doc.userId,
      amountVnd: doc.amountVnd,
      provider: doc.provider,
      orderCode: doc.orderCode,
      checkoutUrl: doc.checkoutUrl,
      qrCode: doc.qrCode,
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
      orderCode: order.props.orderCode,
      checkoutUrl: order.props.checkoutUrl,
      qrCode: order.props.qrCode,
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
          checkoutUrl: order.props.checkoutUrl,
          qrCode: order.props.qrCode,
        },
      )
      .exec();
  }

  async markSucceededIfPending(orderId: string, session?: unknown): Promise<boolean> {
    const res = await this.model
      .updateOne(
        { id: orderId, status: 'PENDING' },
        { $set: { status: 'SUCCEEDED' }, $inc: { version: 1 } },
        session ? { session: session as ClientSession } : undefined,
      )
      .exec();
    return res.modifiedCount === 1;
  }

  async markStatusIfPending(
    orderId: string,
    nextStatus: 'FAILED' | 'CANCELLED' | 'EXPIRED',
    session?: unknown,
  ): Promise<boolean> {
    const res = await this.model
      .updateOne(
        { id: orderId, status: 'PENDING' },
        { $set: { status: nextStatus }, $inc: { version: 1 } },
        session ? { session: session as ClientSession } : undefined,
      )
      .exec();
    return res.modifiedCount === 1;
  }

  async findPendingOrders(olderThanDate: Date, limit: number = 50): Promise<PaymentOrder[]> {
    const docs = await this.model
      .find({ status: 'PENDING', createdAt: { $lte: olderThanDate } })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();

    return docs.map(
      (doc) =>
        new PaymentOrder(doc.id, {
          userId: doc.userId,
          amountVnd: doc.amountVnd,
          provider: doc.provider,
          orderCode: doc.orderCode,
          checkoutUrl: doc.checkoutUrl,
          qrCode: doc.qrCode,
          status: doc.status as PaymentStatus,
          idempotencyKey: doc.idempotencyKey,
          createdAt: (doc as unknown as { createdAt?: Date }).createdAt,
          version: doc.version,
        }),
    );
  }
}
