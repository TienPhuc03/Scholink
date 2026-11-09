import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentOrderDocument = PaymentOrderModel & Document;
export type LedgerEntryDocument = LedgerEntryModel & Document;
export type HoldDocument = HoldModel & Document;
export type PurchaseDocument = PurchaseModel & Document;

/**
 * Mục 12, 21 & 27 SRS: Collection payment_orders (unique provider/merchantOrderId)
 */
@Schema({ collection: 'payment_orders', timestamps: true })
export class PaymentOrderModel {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  amountVnd: number;

  @Prop({ required: true })
  provider: string;

  @Prop()
  merchantOrderId?: string;

  @Prop()
  checkoutUrl?: string;

  @Prop({
    required: true,
    enum: ['CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'FLAGGED'],
    default: 'PENDING',
    index: true,
  })
  status: string;

  @Prop({ index: true })
  idempotencyKey?: string;

  @Prop({ default: 1 })
  version: number;
}

export const PaymentOrderSchema = SchemaFactory.createForClass(PaymentOrderModel);
PaymentOrderSchema.index({ provider: 1, merchantOrderId: 1 }, { unique: true, sparse: true });

/**
 * Mục 12 & 27 SRS: Collection ledger_entries (bút toán kép DEBIT / CREDIT)
 */
@Schema({ collection: 'ledger_entries', timestamps: true })
export class LedgerEntryModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  txId: string;

  @Prop({ required: true, index: true })
  accountId: string;

  @Prop({ required: true, enum: ['DEBIT', 'CREDIT'] })
  direction: string;

  @Prop({ required: true })
  amountVnd: number;

  @Prop({ required: true })
  businessRef: string;
}

export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntryModel);
LedgerEntrySchema.index({ txId: 1, accountId: 1, direction: 1 });

/**
 * Mục 12 & 27 SRS: Collection holds (unique purchaseId)
 */
@Schema({ collection: 'holds', timestamps: true })
export class HoldModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, unique: true, index: true })
  purchaseId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  amountVnd: number;

  @Prop({ required: true, enum: ['HELD', 'CAPTURED', 'RELEASED'], default: 'HELD' })
  status: string;

  @Prop({ required: true })
  expiresAt: Date;
}

export const HoldSchema = SchemaFactory.createForClass(HoldModel);

/**
 * Mục 12 & 27 SRS: Collection purchases (unique actorId/refId)
 */
@Schema({ collection: 'purchases', timestamps: true })
export class PurchaseModel {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, index: true })
  actorId: string;

  @Prop({ required: true })
  refId: string;

  @Prop({ required: true })
  skuCode: string;

  @Prop({ required: true })
  amountVnd: number;

  @Prop({
    required: true,
    enum: ['PENDING', 'FUNDS_HELD', 'PAID', 'FULFILLED', 'CANCELLED', 'COMPENSATING', 'REFUNDED'],
    default: 'PENDING',
  })
  status: string;
}

export const PurchaseSchema = SchemaFactory.createForClass(PurchaseModel);
PurchaseSchema.index({ actorId: 1, refId: 1 }, { unique: true });
