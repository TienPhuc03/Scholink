import { Logger } from '@nestjs/common';
import { OUTBOX_MAX_ATTEMPTS, relayOutboxBatch } from './outbox-relay';

type Row = Record<string, any>;

/** Just enough of a Mongoose model for the relay: find/sort/limit/lean/exec and updateOne/exec. */
function fakeModel(rows: Row[]) {
  const matches = (r: Row, now: Date) =>
    r.sentAt === undefined &&
    (r.attempts === undefined || r.attempts < OUTBOX_MAX_ATTEMPTS) &&
    (r.nextAttemptAt === undefined || r.nextAttemptAt <= now);
  let now = new Date();
  const model: any = {
    setNow: (d: Date) => (now = d),
    find: () => {
      const chain: any = {
        sort: () => chain,
        limit: () => chain,
        lean: () => chain,
        exec: async () => rows.filter((r) => matches(r, now)).map((r) => ({ ...r })),
      };
      return chain;
    },
    updateOne: (filter: Row, update: Row) => ({
      exec: async () => {
        const row = rows.find((r) => r.eventId === filter.eventId)!;
        Object.assign(row, update.$set ?? {});
        for (const k of Object.keys(update.$unset ?? {})) delete row[k];
      },
    }),
  };
  return model;
}

const event = (eventId: string, type: string): Row => ({
  eventId,
  type,
  aggregateId: 'agg',
  correlationId: 'cor',
  occurredAt: new Date('2026-11-01T00:00:00Z'),
  data: { userId: 'u1' },
});

const logger = new Logger('test');
beforeAll(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('relayOutboxBatch', () => {
  it('delivers each pending event once and marks it sent', async () => {
    const rows = [event('e1', 'user.deleted')];
    const seen: string[] = [];
    const model = fakeModel(rows);

    await relayOutboxBatch(model, { 'user.deleted': async (e) => void seen.push(e.eventId) }, logger);
    await relayOutboxBatch(model, { 'user.deleted': async (e) => void seen.push(e.eventId) }, logger);

    expect(seen).toEqual(['e1']);
    expect(rows[0].sentAt).toBeInstanceOf(Date);
  });

  it('marks types without a handler as sent so they do not block the queue', async () => {
    const rows = [event('e1', 'something.else')];
    expect(await relayOutboxBatch(fakeModel(rows), {}, logger)).toEqual({ sent: 1, failed: 0 });
    expect(rows[0].sentAt).toBeInstanceOf(Date);
  });

  it('a failed delivery is retried after a backoff, then succeeds', async () => {
    const rows = [event('e1', 'user.deleted')];
    const model = fakeModel(rows);
    const t0 = new Date('2026-11-12T00:00:00Z');
    let fail = true;
    const handlers = {
      'user.deleted': async () => {
        if (fail) throw new Error('opportunity offline');
      },
    };

    model.setNow(t0);
    expect(await relayOutboxBatch(model, handlers, logger, { now: t0 })).toEqual({ sent: 0, failed: 1 });
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].lastError).toBe('opportunity offline');

    // Still inside the backoff window: not picked up.
    expect(await relayOutboxBatch(model, handlers, logger, { now: t0 })).toEqual({ sent: 0, failed: 0 });

    fail = false;
    const later = new Date(t0.getTime() + 60_000);
    model.setNow(later);
    expect(await relayOutboxBatch(model, handlers, logger, { now: later })).toEqual({ sent: 1, failed: 0 });
    expect(rows[0].lastError).toBeUndefined();
  });

  it('parks an event after the maximum attempts instead of retrying forever', async () => {
    const rows: Row[] = [{ ...event('e1', 'user.deleted'), attempts: OUTBOX_MAX_ATTEMPTS - 1 }];
    const model = fakeModel(rows);
    await relayOutboxBatch(model, { 'user.deleted': async () => Promise.reject(new Error('down')) }, logger);

    expect(rows[0].attempts).toBe(OUTBOX_MAX_ATTEMPTS);
    expect(rows[0].sentAt).toBeUndefined();
    expect(await relayOutboxBatch(model, { 'user.deleted': async () => undefined }, logger)).toEqual({
      sent: 0,
      failed: 0,
    });
  });
});
