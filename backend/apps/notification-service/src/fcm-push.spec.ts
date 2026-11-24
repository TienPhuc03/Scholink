import { FcmPushPublisher, REF_URL_EXTRA, ANDROID_CHANNEL_ID } from './infrastructure/push/fcm-push.publisher';
import { PushPublisher } from './infrastructure/push/push.publisher';
import { PushMessage } from './infrastructure/push/mqtt-push.publisher';
import { DeviceTokenController, RegisterDeviceSchema } from './presentation/device-token.controller';

const message: PushMessage = {
  kind: 'notification',
  notificationKey: 'reminder:opp_1:3d:v1',
  title: 'Nhắc hạn',
  body: 'Còn 3 ngày',
  refUrl: '/opportunities/opp_1',
  sentAt: '2026-11-24T00:00:00.000Z',
};

function tokenModel(tokens: string[]) {
  return {
    find: jest.fn(() => ({ select: () => ({ lean: async () => tokens.map((token) => ({ token })) }) })),
    deleteMany: jest.fn(async () => ({})),
  };
}

describe('FcmPushPublisher', () => {
  it('builds a message the app can show, dedupe and open', () => {
    const m = FcmPushPublisher.buildMessage(['t1'], message);
    expect(m.notification).toEqual({ title: 'Nhắc hạn', body: 'Còn 3 ngày' });
    // same tag as the MQTT notification of this key, so Android replaces instead of duplicating
    expect(m.android?.notification?.tag).toBe(message.notificationKey);
    expect(m.android?.notification?.channelId).toBe(ANDROID_CHANNEL_ID);
    // MainActivity reads this extra when the notification is tapped
    expect(m.data?.[REF_URL_EXTRA]).toBe('/opportunities/opp_1');
    expect(Object.values(m.data ?? {}).every((v) => typeof v === 'string')).toBe(true);
  });

  it('omits refUrl keys when there is no target', () => {
    const m = FcmPushPublisher.buildMessage(['t1'], { ...message, refUrl: undefined });
    expect(m.data).not.toHaveProperty('refUrl');
    expect(m.data).not.toHaveProperty(REF_URL_EXTRA);
  });

  it('sends nothing when the user has no device', async () => {
    const messaging = { sendEachForMulticast: jest.fn() };
    await new FcmPushPublisher(messaging as any, tokenModel([]) as any).publishToUser('u1', message);
    expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('sends to every device and deletes tokens FCM says are dead', async () => {
    const model = tokenModel(['alive', 'gone', 'bad']);
    const messaging = {
      sendEachForMulticast: jest.fn(async () => ({
        successCount: 1,
        failureCount: 2,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          { success: false, error: { code: 'messaging/invalid-registration-token' } },
        ],
      })),
    };
    await new FcmPushPublisher(messaging as any, model as any).publishToUser('u1', message);
    expect(model.find).toHaveBeenCalledWith({ userId: 'u1' });
    expect((messaging.sendEachForMulticast.mock.calls[0] as any)[0].tokens).toEqual(['alive', 'gone', 'bad']);
    expect(model.deleteMany).toHaveBeenCalledWith({ token: { $in: ['gone', 'bad'] } });
  });

  it('keeps tokens on temporary errors', async () => {
    const model = tokenModel(['t1']);
    const messaging = {
      sendEachForMulticast: jest.fn(async () => ({
        successCount: 0,
        failureCount: 1,
        responses: [{ success: false, error: { code: 'messaging/internal-error' } }],
      })),
    };
    await new FcmPushPublisher(messaging as any, model as any).publishToUser('u1', message);
    expect(model.deleteMany).not.toHaveBeenCalled();
  });

  it('never throws: FCM down must not fail the reminder or transactional insert', async () => {
    const messaging = { sendEachForMulticast: jest.fn(async () => Promise.reject(new Error('network'))) };
    await expect(
      new FcmPushPublisher(messaging as any, tokenModel(['t1']) as any).publishToUser('u1', message),
    ).resolves.toBeUndefined();
  });
});

describe('PushPublisher', () => {
  it('pushes on both channels', async () => {
    const fcm = { publishToUser: jest.fn(async () => undefined) };
    const mqtt = { publishToUser: jest.fn(async () => undefined) };
    await new PushPublisher(mqtt, fcm).publishToUser('u1', message);
    expect(fcm.publishToUser).toHaveBeenCalledWith('u1', message);
    expect(mqtt.publishToUser).toHaveBeenCalledWith('u1', message);
  });

  it('still propagates MQTT errors so the reminder job is retried', async () => {
    const fcm = { publishToUser: jest.fn(async () => undefined) };
    const mqtt = { publishToUser: jest.fn(async () => Promise.reject(new Error('broker down'))) };
    await expect(new PushPublisher(mqtt, fcm).publishToUser('u1', message)).rejects.toThrow('broker down');
    expect(fcm.publishToUser).toHaveBeenCalled();
  });

  it('works with only one channel configured', async () => {
    const fcm = { publishToUser: jest.fn(async () => undefined) };
    await new PushPublisher(null, fcm).publishToUser('u1', message);
    expect(fcm.publishToUser).toHaveBeenCalled();
  });
});

describe('DeviceTokenController', () => {
  it('moves a device token to the account now signed in', async () => {
    const model = { updateOne: jest.fn(async () => ({})) };
    const ctrl = new DeviceTokenController(model as any);
    const token = 'x'.repeat(40);
    await expect(
      ctrl.register({ user: { userId: 'u2' } } as any, { token, platform: 'android' }),
    ).resolves.toEqual({ registered: true });
    expect(model.updateOne).toHaveBeenCalledWith(
      { token },
      { $set: { userId: 'u2', platform: 'android' } },
      { upsert: true },
    );
  });

  it('rejects unknown platforms and too-short tokens', () => {
    expect(RegisterDeviceSchema.safeParse({ token: 'x'.repeat(40), platform: 'web' }).success).toBe(false);
    expect(RegisterDeviceSchema.safeParse({ token: 'short', platform: 'android' }).success).toBe(false);
    expect(RegisterDeviceSchema.safeParse({ token: 'x'.repeat(40), platform: 'ios' }).success).toBe(true);
  });
});
