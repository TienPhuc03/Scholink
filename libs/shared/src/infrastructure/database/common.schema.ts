import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OutboxDocument = OutboxModel & Document;
export type ProcessedEventDocument = ProcessedEventModel & Document;
export type IdempotencyKeyDocument = IdempotencyKeyModel & Document;

/**
 * Mục 27 & 28 SRS: Bảng outbox dùng chung trên mọi database
 * Ghi trong cùng transaction với dữ liệu nghiệp vụ, relay phát bền qua RabbitMQ.
 */
@Schema({ collection: 'outbox', timestamps: true })
export class OutboxModel {
  @Prop({ required: true, unique: true, index: true })
  eventId: string;

  @Prop({ required: true, index: true })
  type: string;

  @Prop({ required: true, default: 1 })
  schemaVersion: number;

  @Prop({ required: true })
  occurredAt: Date;

  @Prop({ required: true })
  producer: string;

  @Prop({ required: true, index: true })
  aggregateId: string;

  @Prop({ required: true, default: 1 })
  aggregateVersion: number;

  @Prop({ required: true, index: true })
  correlationId: string;

  @Prop()
  causationId?: string;

  @Prop({ type: Object, required: true })
  data: Record<string, unknown>;

  @Prop({ index: true })
  sentAt?: Date;
}

export const OutboxSchema = SchemaFactory.createForClass(OutboxModel);
OutboxSchema.index({ sentAt: 1, occurredAt: 1 });

/**
 * Mục 27 & 28 SRS: Bảng processed_events chống xử lý lặp event tại Consumer
 */
@Schema({ collection: 'processed_events', timestamps: true })
export class ProcessedEventModel {
  @Prop({ required: true })
  consumerName: string;

  @Prop({ required: true })
  eventId: string;

  @Prop({ required: true, default: () => new Date() })
  processedAt: Date;
}

export const ProcessedEventSchema = SchemaFactory.createForClass(ProcessedEventModel);
ProcessedEventSchema.index({ consumerName: 1, eventId: 1 }, { unique: true });

/**
 * Mục 25 & 27 SRS: Bảng idempotency_keys chống gửi trùng request trong 24 giờ
 */
@Schema({ collection: 'idempotency_keys', timestamps: true })
export class IdempotencyKeyModel {
  @Prop({ required: true })
  actorId: string;

  @Prop({ required: true })
  method: string;

  @Prop({ required: true })
  route: string;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  requestHash: string;

  @Prop({ required: true, enum: ['PROCESSING', 'COMPLETED'], default: 'PROCESSING' })
  status: string;

  @Prop()
  statusCode?: number;

  @Prop({ type: Object })
  responseBody?: Record<string, unknown>;

  @Prop({
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    index: { expires: 0 },
  })
  expiresAt: Date;
}

export const IdempotencyKeySchema = SchemaFactory.createForClass(IdempotencyKeyModel);
IdempotencyKeySchema.index({ actorId: 1, method: 1, route: 1, key: 1 }, { unique: true });
