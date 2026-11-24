import { Logger } from '@nestjs/common';
import type { Model } from 'mongoose';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging, MulticastMessage } from 'firebase-admin/messaging';
import type { DeviceTokenDocument } from '../persistence/notification.schema';
import type { PushMessage } from './mqtt-push.publisher';

/** FCM answers for tokens that will never work again: the app was uninstalled or the token deleted. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Android notification channel created by MainActivity.kt (same one MQTT pushes use). */
export const ANDROID_CHANNEL_ID = 'scholink_reminders';
/** Intent extra MainActivity.kt reads when a notification is tapped (opens refUrl). */
export const REF_URL_EXTRA = 'scholink_ref_url';

const FCM_APP_NAME = 'notification-fcm';

/**
 * FCM sender, or null when the service account is not configured (GOOGLE_APPLICATION_CREDENTIALS =
 * path to the JSON key from Firebase Console). Without it pushes go over MQTT only.
 */
export function createFcmPublisher(tokenModel: Model<DeviceTokenDocument>): FcmPushPublisher | null {
  const logger = new Logger(FcmPushPublisher.name);
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    logger.log('[Push] Chưa đặt GOOGLE_APPLICATION_CREDENTIALS: tắt FCM, chỉ đẩy qua MQTT.');
    return null;
  }
  const app =
    getApps().find((a) => a.name === FCM_APP_NAME) ??
    initializeApp({ credential: applicationDefault() }, FCM_APP_NAME);
  return new FcmPushPublisher(getMessaging(app), tokenModel);
}

/**
 * Push channel over Firebase Cloud Messaging: reaches the app even when it is closed, which MQTT
 * cannot. Best-effort: errors are logged, never thrown, so MQTT keeps driving the retry rules.
 */
export class FcmPushPublisher {
  private readonly logger = new Logger(FcmPushPublisher.name);

  constructor(
    private readonly messaging: Pick<Messaging, 'sendEachForMulticast'>,
    private readonly tokenModel: Model<DeviceTokenDocument>,
  ) {}

  static buildMessage(tokens: string[], message: PushMessage): MulticastMessage {
    const data: Record<string, string> = {
      kind: message.kind,
      notificationKey: message.notificationKey,
      title: message.title,
      body: message.body,
      sentAt: message.sentAt,
    };
    if (message.refUrl) {
      data.refUrl = message.refUrl;
      data[REF_URL_EXTRA] = message.refUrl;
    }
    return {
      tokens,
      notification: { title: message.title, body: message.body },
      data,
      // Same tag as the MQTT notification of this key: one replaces the other instead of showing twice.
      android: {
        priority: 'high',
        notification: { tag: message.notificationKey, channelId: ANDROID_CHANNEL_ID },
      },
      apns: { headers: { 'apns-collapse-id': message.notificationKey.slice(0, 64) } },
    };
  }

  async publishToUser(userId: string, message: PushMessage): Promise<void> {
    try {
      const rows = await this.tokenModel.find({ userId }).select('token').lean();
      const tokens = rows.map((r) => r.token);
      if (tokens.length === 0) return;

      const res = await this.messaging.sendEachForMulticast(FcmPushPublisher.buildMessage(tokens, message));
      const dead = tokens.filter((_, i) => DEAD_TOKEN_CODES.has(res.responses[i]?.error?.code ?? ''));
      if (dead.length > 0) await this.tokenModel.deleteMany({ token: { $in: dead } });
      this.logger.log(
        `[Push] FCM user ${userId} <- ${message.notificationKey}: ${res.successCount}/${tokens.length} ok, ${dead.length} token hết hiệu lực đã xoá`,
      );
    } catch (e) {
      this.logger.warn(`[Push] FCM thất bại cho user ${userId}, vẫn có trong Hộp thư: ${(e as Error).message}`);
    }
  }
}
