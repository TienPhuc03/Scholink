import type { MqttPushPublisher, PushMessage } from './mqtt-push.publisher';
import type { FcmPushPublisher } from './fcm-push.publisher';

/**
 * Sends one push on every configured channel. FCM is best-effort (never throws). MQTT errors
 * still propagate, so the reminder worker keeps retrying a broker that is down; a retry may send
 * the FCM message again, which the device shows in place of the first one (same tag).
 */
export class PushPublisher {
  constructor(
    private readonly mqtt: Pick<MqttPushPublisher, 'publishToUser'> | null,
    private readonly fcm: Pick<FcmPushPublisher, 'publishToUser'> | null,
  ) {}

  async publishToUser(userId: string, message: PushMessage): Promise<void> {
    await this.fcm?.publishToUser(userId, message);
    await this.mqtt?.publishToUser(userId, message);
  }
}
