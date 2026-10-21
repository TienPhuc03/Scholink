import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentOrderDocument = PaymentOrderModel & Document;

@Schema({ collection: 'payment_orders', timestamps: true })
export class PaymentOrderModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  amountVnd: number;

  @Prop({ required: true })
  provider: string;

  @Prop()
  checkoutUrl?: string;

  @Prop({ required: true, default: 'PENDING', index: true })
  status: string;

  @Prop({ index: true })
  idempotencyKey?: string;

  @Prop({ default: 1 })
  version: number;
}

export const PaymentOrderSchema = SchemaFactory.createForClass(PaymentOrderModel);
