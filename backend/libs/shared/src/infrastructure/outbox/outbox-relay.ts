import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { OutboxDocument } from '../database/common.schema';

export interface OutboxEvent {
  readonly eventId: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly occurredAt: Date;
  readonly data: Record<string, unknown>;
  readonly attempts: number;
}

/** Delivers one event. Throw to retry later; resolve to mark it sent. Handlers must be idempotent. */
export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

export const OUTBOX_MAX_ATTEMPTS = 8;

/** Exponential backoff: 2s, 4s, ... capped at 5 minutes. */
export const outboxBackoffMs = (attempts: number) => Math.min(5 * 60_000, 2 ** attempts * 1000);

/**
 * Mục 27/28 SRS: one relay pass over the service's own `outbox` collection. Events are delivered
 * at least once in `occurredAt` order; types without a handler are marked sent so they do not
 * block the queue. After {@link OUTBOX_MAX_ATTEMPTS} failures an event is parked (nextAttemptAt
 * cleared, sentAt unset) and logged as an error for manual replay.
 *
 * shortcut: assumes one running instance per service (no claim/lease on rows); add a lease field
 * before running two replicas.
 */
export async function relayOutboxBatch(
  model: Model<OutboxDocument>,
  handlers: Readonly<Record<string, OutboxHandler>>,
  logger: Logger,
  options: { batchSize?: number; now?: Date } = {},
): Promise<{ sent: number; failed: number }> {
  const now = options.now ?? new Date();
  const docs = await model
    .find({
      sentAt: { $exists: false },
      $and: [
        { $or: [{ attempts: { $exists: false } }, { attempts: { $lt: OUTBOX_MAX_ATTEMPTS } }] },
        { $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }] },
      ],
    })
    .sort({ occurredAt: 1 })
    .limit(options.batchSize ?? 20)
    .lean<Array<OutboxDocument & { attempts?: number }>>()
    .exec();

  let sent = 0;
  let failed = 0;
  for (const doc of docs) {
    const handler = handlers[doc.type];
    try {
      if (handler) {
        await handler({
          eventId: doc.eventId,
          type: doc.type,
          aggregateId: doc.aggregateId,
          correlationId: doc.correlationId,
          occurredAt: doc.occurredAt,
          data: doc.data ?? {},
          attempts: doc.attempts ?? 0,
        });
      }
      await model.updateOne({ eventId: doc.eventId }, { $set: { sentAt: new Date() }, $unset: { lastError: 1 } }).exec();
      sent++;
    } catch (err: any) {
      failed++;
      const attempts = (doc.attempts ?? 0) + 1;
      const parked = attempts >= OUTBOX_MAX_ATTEMPTS;
      await model
        .updateOne(
          { eventId: doc.eventId },
          {
            $set: {
              attempts,
              lastError: String(err?.message ?? err).slice(0, 500),
              ...(parked ? {} : { nextAttemptAt: new Date(now.getTime() + outboxBackoffMs(attempts)) }),
            },
          },
        )
        .exec();
      const line = `[Outbox] ${doc.type} ${doc.eventId} lỗi lần ${attempts}/${OUTBOX_MAX_ATTEMPTS}: ${err?.message ?? err}`;
      if (parked) logger.error(`${line} — đã dừng thử lại, cần xử lý tay.`);
      else logger.warn(line);
    }
  }
  return { sent, failed };
}
