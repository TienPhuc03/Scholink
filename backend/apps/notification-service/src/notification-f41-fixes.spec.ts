jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => () => {},
  EventEmitter2: jest.fn().mockImplementation(() => ({ emit: jest.fn() })),
}));

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => {},
}));

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest.fn(),
}));

import moment = require('moment-timezone');
import { BookmarkListener } from './application/use-cases/listeners/bookmark.listener';
import { QuietHoursService } from './application/use-cases/services/quiet-hours.service';
import { ReminderWorker } from './application/use-cases/workers/reminder.worker';
import {
  NotificationPreferenceUseCase,
  UpdateNotificationPreferenceSchema,
} from './application/use-cases/notification-preference.use-case';

/** Small in-memory stand-in for the Mongoose models used by the notification service. */
function matches(item: Record<string, any>, query: Record<string, any>): boolean {
  return Object.entries(query).every(([key, cond]) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$in' in cond) return cond.$in.includes(item[key]);
      if ('$lt' in cond) return item[key] < cond.$lt;
      if ('$gt' in cond) return item[key] > cond.$gt;
    }
    return item[key] === cond;
  });
}

function withSave(doc: Record<string, any>, store: Map<string, any>) {
  return Object.assign(doc, {
    save: async () => {
      store.set(doc.id, doc);
      return doc;
    },
  });
}

describe('F41 fixes - Notification reminders, inbox dedup and preferences (NOTI-02/03)', () => {
  let reminders: Map<string, any>;
  let notifications: any[];
  let preferences: Map<string, any>;
  let jobs: any[];
  let pushes: string[];

  let reminderModel: any;
  let notificationModel: any;
  let preferenceModel: any;
  let queue: any;
  let listener: BookmarkListener;
  let worker: ReminderWorker;

  beforeEach(() => {
    reminders = new Map();
    notifications = [];
    preferences = new Map();
    jobs = [];
    pushes = [];

    queue = {
      add: jest.fn(async (name: string, data: any, opts: any) => {
        jobs.push({ name, data, opts });
        return { id: opts.jobId, data };
      }),
      getJobs: jest.fn(async () =>
        jobs.map((j) => ({
          id: j.opts.jobId,
          data: j.data,
          remove: async () => {
            jobs = jobs.filter((x) => x !== j);
          },
        })),
      ),
    };

    reminderModel = {
      findOneAndUpdate: jest.fn(async (query: any, update: any) => {
        const doc = { ...query, ...update };
        reminders.set(doc.id, doc);
        return doc;
      }),
      findOne: jest.fn(async (query: any) => {
        for (const item of reminders.values()) {
          if (matches(item, query)) return withSave(item, reminders);
        }
        return null;
      }),
      find: jest.fn((query: any) => {
        const found = Array.from(reminders.values()).filter((r) => matches(r, query));
        return {
          exec: async () => found.map((r) => withSave(r, reminders)),
          distinct: async (field: string) => Array.from(new Set(found.map((r) => r[field]))),
        };
      }),
      updateMany: jest.fn(async (query: any, update: any) => {
        let modifiedCount = 0;
        for (const item of reminders.values()) {
          if (matches(item, query)) {
            Object.assign(item, update.$set);
            modifiedCount++;
          }
        }
        return { modifiedCount };
      }),
    };

    // Enforces the real unique (userId, businessKey) index.
    notificationModel = {
      create: jest.fn(async (data: any) => {
        if (notifications.some((n) => n.userId === data.userId && n.businessKey === data.businessKey)) {
          const err: any = new Error('E11000 duplicate key error');
          err.code = 11000;
          throw err;
        }
        notifications.push(data);
        return data;
      }),
    };

    preferenceModel = {
      findOne: jest.fn((query: any) => ({ lean: async () => preferences.get(query.userId) ?? null })),
      findOneAndUpdate: jest.fn((query: any, update: any) => ({
        lean: async () => {
          const doc = { ...(preferences.get(query.userId) ?? update.$setOnInsert), ...update.$set };
          preferences.set(query.userId, doc);
          return doc;
        },
      })),
    };

    listener = new BookmarkListener(queue, new QuietHoursService(), reminderModel, preferenceModel);
    worker = new ReminderWorker(
      notificationModel,
      reminderModel,
      { get: (_k: string, d: any) => d } as any,
      preferenceModel,
    );
    jest.spyOn<any, any>(worker, 'fetchOpportunityStatus').mockResolvedValue({
      status: 'PUBLISHED',
      version: 1,
      deadline: moment().add(30, 'days').toDate(),
    });
    jest.spyOn<any, any>(worker, 'sendPushNotification').mockImplementation(async (userId: any) => {
      pushes.push(String(userId));
    });
  });

  const jobFor = (offset: string) => {
    const job = jobs.find((j) => j.data.offsetLabel === offset);
    if (!job) throw new Error(`no job for ${offset}`);
    return { id: job.opts.jobId, data: job.data } as any;
  };

  it('delivers the 7d, 3d and 1d reminders of one opportunity as three inbox messages', async () => {
    await listener.handleBookmarkCreated({
      userId: 'u1',
      opportunityId: 'opp_1',
      deadline: moment().add(30, 'days').toDate(),
      version: 1,
      title: 'Học bổng A',
    });

    await worker.processJob(jobFor('7d'));
    await worker.processJob(jobFor('3d'));
    await worker.processJob(jobFor('1d'));

    expect(notifications).toHaveLength(3);
    expect(new Set(notifications.map((n) => n.businessKey)).size).toBe(3);
    expect(notifications.every((n) => n.type === 'DEADLINE_REMINDER')).toBe(true);
    expect(notifications[0].title).toContain('Học bổng A');
    expect(notifications.every((n) => n.refUrl === '/opportunities/opp_1')).toBe(true);

    // Each milestone's own reminder is marked SENT, not another offset's.
    const statuses = Array.from(reminders.values()).map((r) => `${r.offset}:${r.status}`);
    expect(statuses.sort()).toEqual(['1d:SENT', '3d:SENT', '7d:SENT']);
  });

  it('does not create a second message or push when the same job runs again (retry)', async () => {
    await listener.handleBookmarkCreated({
      userId: 'u2',
      opportunityId: 'opp_2',
      deadline: moment().add(30, 'days').toDate(),
      version: 1,
    });
    const job = jobFor('7d');

    await worker.processJob(job);
    // Simulate a crash before SENT was saved: reminder back to SCHEDULED, job retried.
    for (const r of reminders.values()) if (r.offset === '7d') r.status = 'SCHEDULED';
    await worker.processJob(job);

    expect(notifications).toHaveLength(1);
    expect(pushes).toHaveLength(1);
  });

  it('skips push (inbox only) when the user turned the push channel off', async () => {
    preferences.set('u3', { userId: 'u3', pushEnabled: false, preferenceVersion: 1 });
    await listener.handleBookmarkCreated({
      userId: 'u3',
      opportunityId: 'opp_3',
      deadline: moment().add(30, 'days').toDate(),
      version: 1,
    });

    await worker.processJob(jobFor('7d'));

    expect(notifications).toHaveLength(1);
    expect(pushes).toHaveLength(0);
  });

  it("plans quiet hours in the user's own timezone when one is saved", async () => {
    preferences.set('u4', { userId: 'u4', timezone: 'America/New_York', preferenceVersion: 1 });
    await listener.handleBookmarkCreated({
      userId: 'u4',
      opportunityId: 'opp_4',
      deadline: moment().add(30, 'days').toDate(),
      version: 1,
      timezone: 'Asia/Ho_Chi_Minh',
    });

    const planned = Array.from(reminders.values());
    expect(planned.length).toBe(3);
    expect(planned.every((r) => r.timezone === 'America/New_York')).toBe(true);
    for (const r of planned) {
      const hour = moment(r.plannedSendAt).tz('America/New_York').hour();
      expect(hour >= 7 && hour < 22).toBe(true);
    }
  });

  it('changing timezone bumps the preference version, re-plans pending reminders and drops old jobs', async () => {
    const useCase = new NotificationPreferenceUseCase(preferenceModel, listener);
    await listener.handleBookmarkCreated({
      userId: 'u5',
      opportunityId: 'opp_5',
      deadline: moment().add(30, 'days').toDate(),
      version: 1,
    });
    const oldJob = jobFor('7d');

    const res = await useCase.update('u5', { timezone: 'Europe/London', pushEnabled: false });

    expect(res.timezone).toBe('Europe/London');
    expect(res.pushEnabled).toBe(false);
    expect(res.inAppEnabled).toBe(true);
    expect(res.preferenceVersion).toBe(2);
    expect(res.rescheduledReminders).toBe(3);
    expect(Array.from(reminders.values()).every((r) => r.preferenceVersion === 2)).toBe(true);
    expect(jobs.every((j) => j.data.preferenceVersion === 2)).toBe(true);

    // An old job that was already picked up still must not deliver.
    await worker.processJob(oldJob);
    expect(notifications).toHaveLength(0);
  });

  it('saving channels only keeps the preference version (no re-planning)', async () => {
    const useCase = new NotificationPreferenceUseCase(preferenceModel, listener);
    const res = await useCase.update('u6', { emailEnabled: false });
    expect(res.preferenceVersion).toBe(1);
    expect(res.rescheduledReminders).toBe(0);
    expect((await useCase.get('u6')).emailEnabled).toBe(false);
  });

  it('rejects unknown timezones and unknown fields', () => {
    expect(UpdateNotificationPreferenceSchema.safeParse({ timezone: 'Mars/Base' }).success).toBe(false);
    expect(UpdateNotificationPreferenceSchema.safeParse({ quietStart: '01:00' }).success).toBe(false);
    expect(UpdateNotificationPreferenceSchema.safeParse({ timezone: 'Asia/Tokyo' }).success).toBe(true);
  });

  it('a deadline that changed without its event is not reminded with the old date; it is re-planned', async () => {
    const replanWorker = new ReminderWorker(
      notificationModel,
      reminderModel,
      { get: (_k: string, d: any) => d } as any,
      preferenceModel,
      listener,
    );
    await listener.handleBookmarkCreated({
      userId: 'u8',
      opportunityId: 'opp_8',
      deadline: moment().add(20, 'days').toDate(),
      version: 1,
      title: 'Cơ hội 8',
    });
    const job = jobFor('7d');
    jest.spyOn<any, any>(replanWorker, 'fetchOpportunityStatus').mockResolvedValue({
      status: 'PUBLISHED',
      version: 2,
      deadline: moment().add(40, 'days').toDate(),
    });

    await replanWorker.processJob(job);

    expect(notifications).toHaveLength(0);
    expect(reminders.get(job.id)?.reason ?? Array.from(reminders.values()).find((r) => r.offset === '7d' && r.deadlineVersion === 1)?.reason)
      .toBe('DEADLINE_CHANGED');
    expect(Array.from(reminders.values()).some((r) => r.deadlineVersion === 2 && r.status === 'SCHEDULED')).toBe(true);
  });

  it('version bumps that keep the deadline (tag edit, merge) still deliver the reminder', async () => {
    const deadline = moment().add(30, 'days').toDate();
    await listener.handleBookmarkCreated({ userId: 'u9', opportunityId: 'opp_9', deadline, version: 1 });
    jest.spyOn<any, any>(worker, 'fetchOpportunityStatus').mockResolvedValue({ status: 'PUBLISHED', version: 5, deadline });

    await worker.processJob(jobFor('7d'));
    expect(notifications).toHaveLength(1);
  });

  it('Opportunity Service down: the job fails (BullMQ retries) instead of sending made-up data', async () => {
    await listener.handleBookmarkCreated({
      userId: 'u10',
      opportunityId: 'opp_10',
      deadline: moment().add(30, 'days').toDate(),
      version: 1,
    });
    jest.spyOn<any, any>(worker, 'fetchOpportunityStatus').mockRestore();
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(worker.processJob(jobFor('7d'))).rejects.toThrow('ECONNREFUSED');
    expect(notifications).toHaveLength(0);
  });

  it('push provider failure is retried (limited) without a second inbox message', async () => {
    await listener.handleBookmarkCreated({
      userId: 'u11',
      opportunityId: 'opp_11',
      deadline: moment().add(30, 'days').toDate(),
      version: 1,
    });
    const job = { ...jobFor('7d'), attemptsMade: 0, opts: { attempts: 3 } };
    const push = jest
      .spyOn<any, any>(worker, 'sendPushNotification')
      .mockRejectedValueOnce(new Error('FCM 503'))
      .mockImplementation(async (u: any) => {
        pushes.push(String(u));
      });

    await expect(worker.processJob(job)).rejects.toThrow('FCM 503');
    const rem = Array.from(reminders.values()).find((r) => r.userId === 'u11' && r.offset === '7d');
    expect(rem.status).toBe('SENT');
    expect(rem.pushStatus).toBe('PENDING_RETRY');

    await worker.processJob({ ...job, attemptsMade: 1 });
    expect(notifications).toHaveLength(1);
    expect(push).toHaveBeenCalledTimes(2);
    expect(rem.pushStatus).toBe('SENT');
  });

  it('push failing on the last attempt is recorded as FAILED, the inbox message stays', async () => {
    await listener.handleBookmarkCreated({
      userId: 'u12',
      opportunityId: 'opp_12',
      deadline: moment().add(30, 'days').toDate(),
      version: 1,
    });
    jest.spyOn<any, any>(worker, 'sendPushNotification').mockRejectedValue(new Error('FCM down'));

    await worker.processJob({ ...jobFor('7d'), attemptsMade: 2, opts: { attempts: 3 } });

    const rem = Array.from(reminders.values()).find((r) => r.userId === 'u12' && r.offset === '7d');
    expect(rem.pushStatus).toBe('FAILED');
    expect(notifications).toHaveLength(1);
  });

  it('an old opportunity-updated event arriving after a newer one is ignored (F35)', async () => {
    const d = moment().add(20, 'days').toDate();
    await listener.handleBookmarkCreated({ userId: 'u13', opportunityId: 'opp_13', deadline: d, version: 1 });
    await listener.handleOpportunityUpdated({
      opportunityId: 'opp_13',
      newDeadline: moment().add(40, 'days').toDate(),
      version: 3,
    });
    const before = reminders.size;

    const res: any = await listener.handleOpportunityUpdated({
      opportunityId: 'opp_13',
      newDeadline: moment().add(30, 'days').toDate(),
      version: 2,
    });

    expect(res.ignored).toBe('STALE_VERSION');
    expect(reminders.size).toBe(before);
    expect(Array.from(reminders.values()).some((r) => r.deadlineVersion === 2)).toBe(false);
  });

  it('a leftover job without its reminder record sends nothing', async () => {
    await worker.processJob({
      id: 'rem_ghost_opp_x_7d_v1',
      data: { userId: 'ghost', opportunityId: 'opp_x', version: 1, offsetLabel: '7d', reason: 'NORMAL', plannedSendAt: new Date() },
    } as any);
    expect(notifications).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  it('a deadline extension re-plans reminders only for users who still keep the bookmark', async () => {
    const deadline = moment().add(20, 'days').toDate();
    await listener.handleBookmarkCreated({ userId: 'keep', opportunityId: 'opp_7', deadline, version: 1 });
    await listener.handleBookmarkCreated({ userId: 'gone', opportunityId: 'opp_7', deadline, version: 1 });
    await listener.handleBookmarkDeleted({ userId: 'gone', opportunityId: 'opp_7' });

    const res = await listener.handleOpportunityUpdated({
      opportunityId: 'opp_7',
      newDeadline: moment().add(40, 'days').toDate(),
      version: 2,
    });

    expect(res.recalculatedUsers).toBe(1);
    const v2Users = new Set(
      Array.from(reminders.values())
        .filter((r) => r.deadlineVersion === 2)
        .map((r) => r.userId),
    );
    expect(Array.from(v2Users)).toEqual(['keep']);
  });
});
