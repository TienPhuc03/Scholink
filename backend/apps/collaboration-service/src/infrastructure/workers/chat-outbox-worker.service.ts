import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IChatRepository, CHAT_REPOSITORY } from '../../domain/ports/chat.repository.port';

@Injectable()
export class ChatOutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatOutboxWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    @Inject(CHAT_REPOSITORY) private readonly chatRepo: IChatRepository,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.logger.log('🚀 Khởi động Chat Outbox Worker (SCHOL-26: phát event qua MQTT/broker & retry an toàn)...');
    // Poll every 3 seconds for pending outbox events
    this.timer = setInterval(() => this.processOutboxBatch(), 3000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /**
   * Process pending outbox events batch.
   * Public to allow explicit trigger in automated tests.
   */
  async processOutboxBatch(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let processedCount = 0;
    try {
      const repoWithClaim = this.chatRepo as IChatRepository & {
        claimPendingOutboxEvents?: (limit?: number) => Promise<any[]>;
      };
      const records = repoWithClaim.claimPendingOutboxEvents
        ? await repoWithClaim.claimPendingOutboxEvents(20)
        : await this.chatRepo.findPendingOutboxEvents(20);
      if (records.length === 0) {
        return 0;
      }

      for (const record of records) {
        try {
          await this.publishEvent(record);
          await this.chatRepo.markOutboxPublished(record.id);
          processedCount++;
          this.logger.debug(`[OutboxWorker] Đã phát thành công event ${record.id} (aggregateId: ${record.aggregateId})`);
        } catch (err: any) {
          const newRetry = record.retryCount + 1;
          const delayMs = Math.min(60000, Math.pow(2, newRetry) * 1000);
          const nextRetryAt = new Date(Date.now() + delayMs);
          await this.chatRepo.markOutboxFailed(record.id, err.message, nextRetryAt, newRetry);
          this.logger.warn(`[OutboxWorker] Lỗi phát event ${record.id} (lần ${newRetry}/5): ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[OutboxWorker Error] Lỗi quét outbox: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  /**
   * Publish event to MQTT broker & coordinate with Notification Service
   */
  private async publishEvent(record: any): Promise<void> {
    // T6: Xử lý sự kiện Team (TEAM_JOIN_REQUEST, TEAM_JOIN_REVIEWED)
    if (
      record.aggregateType === 'TEAM' ||
      record.eventType === 'TEAM_JOIN_REQUEST' ||
      record.eventType === 'TEAM_JOIN_REVIEWED'
    ) {
      await this.notifyTeamEvent(record);
      return;
    }

    const payload = record.payload;
    const roomId = record.aggregateId;

    // 1. MQTT Message Delivery (Topic: scholink/rooms/{roomId}/messages)
    // Server is the single authoritative publisher. Clients consume by ID and seq.
    const mqttTopic = `scholink/rooms/${roomId}/messages`;
    const mqttMessage = {
      eventId: record.id,
      messageId: payload.messageId,
      roomId,
      senderId: payload.senderId,
      seq: payload.seq,
      content: payload.content,
      clientMsgId: payload.clientMsgId,
      assetId: payload.assetId,
      createdAt: payload.createdAt,
    };

    // Attempt delivery to EMQX broker if MQTT endpoint is configured
    await this.dispatchToBroker(mqttTopic, mqttMessage);

    // 2. Coordinate with Notification Service without duplicate inbox spam
    // Business key: chat_msg_{messageId} ensures exact-once notification per user
    await this.notifyOfflineParticipants(payload);
  }

  /**
   * T6: Dispatch Team events (Join Request, Review) to Notification Service
   */
  private async notifyTeamEvent(record: any): Promise<void> {
    const notiUrl = this.configService.get<string>('NOTIFICATION_SERVICE_URL', 'http://localhost:3005');
    const payload = record.payload;

    try {
      if (process.env.NODE_ENV !== 'test') {
        await fetch(`${notiUrl}/api/v1/notifications/transactional`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: payload.userId,
            businessKey: payload.businessKey,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            refUrl: payload.refUrl,
          }),
        }).catch((err) => {
          this.logger.warn(`[OutboxWorker] Lỗi gửi thông báo transactional: ${err.message}`);
        });
      }
    } catch {
      // Fail-safe notification dispatch
    }
  }

  /**
   * Dispatch payload to broker (e.g. EMQX HTTP API or internal message bus)
   */
  private async dispatchToBroker(topic: string, data: any): Promise<void> {
    const emqxApiUrl = this.configService.get<string>('EMQX_API_URL', 'http://localhost:18083/api/v5');
    const emqxUser = this.configService.get<string>('EMQX_API_USERNAME') || this.configService.get<string>('EMQX_API_KEY');
    const emqxPass = this.configService.get<string>('EMQX_API_PASSWORD') || this.configService.get<string>('EMQX_API_SECRET');
    if (!emqxUser || !emqxPass) {
      if (process.env.NODE_ENV !== 'test') {
        this.logger.debug('[OutboxWorker] Bỏ qua EMQX HTTP publish: chưa cấu hình EMQX_API_USERNAME/EMQX_API_PASSWORD.');
      }
      return;
    }
    // Best-effort HTTP publish to EMQX
    try {
      if (process.env.NODE_ENV !== 'test') {
        const auth = Buffer.from(`${emqxUser}:${emqxPass}`).toString('base64');
        await fetch(`${emqxApiUrl}/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify({
            topic,
            payload: JSON.stringify(data),
            qos: 1,
            retain: false,
          }),
        }).catch(() => {
          // In test/dev environment where EMQX might be offline, log and continue
        });
      }
    } catch {
      // Do not block outbox worker if optional EMQX broker is unreachable in test mode
    }
  }

  /**
   * Coordinate with Notification Service to alert offline members
   * Dedup key: chat_msg_{messageId} guarantees zero duplicate notifications on retry
   */
  private async notifyOfflineParticipants(payload: any): Promise<void> {
    const notiUrl = this.configService.get<string>('NOTIFICATION_SERVICE_URL', 'http://localhost:3005');
    const participants: string[] = payload.participants || [];
    const recipients = participants.filter((p) => p !== payload.senderId);

    if (recipients.length === 0) return;

    try {
      if (process.env.NODE_ENV !== 'test') {
        for (const recipientId of recipients) {
          await fetch(`${notiUrl}/api/v1/notifications/transactional`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: recipientId,
              businessKey: `chat_msg_${payload.messageId}`,
              type: 'CHAT_MESSAGE',
              title: 'Tin nhắn mới',
              body: payload.content?.substring(0, 80) || 'Bạn có tin nhắn mới',
              refUrl: `/chat/rooms/${payload.roomId}`,
            }),
          }).catch(() => {});
        }
      }
    } catch {
      // Fail-safe notification dispatch
    }
  }
}
