import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OutboxDocument, OutboxEvent, OutboxHandler, OutboxModel, relayOutboxBatch } from '@shared';

type Send = (body: Record<string, unknown>) => Promise<void>;

/**
 * Mục 28 SRS: relays the Application outbox to the student's in-app inbox. The notification
 * service dedups on (userId, businessKey) and the business key is the outbox eventId, so a
 * retried delivery never creates a second notification.
 */
@Injectable()
export class ApplicationOutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApplicationOutboxRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private send: Send;

  constructor(
    @InjectModel(OutboxModel.name) private readonly outbox: Model<OutboxDocument>,
    config: ConfigService,
  ) {
    const url = config.get<string>('NOTIFICATION_SERVICE_URL', 'http://localhost:3005');
    this.send = async (body) => {
      const res = await fetch(`${url}/api/v1/notifications/transactional`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Notification service trả về HTTP ${res.status}`);
    };
  }

  /** Lets tests capture deliveries instead of calling the notification service. */
  useSender(send: Send) {
    this.send = send;
  }

  readonly handlers: Readonly<Record<string, OutboxHandler>> = {
    'application.submitted': (e) => this.notifyApplicants(e, 'Đã nộp hồ sơ', 'Hồ sơ của bạn đã được gửi tới đơn vị tổ chức.'),
    'application.resubmitted': (e) =>
      this.notifyApplicants(e, 'Đã nộp lại hồ sơ', `Lần nộp ${e.data.revision ?? ''} đã được gửi tới đơn vị tổ chức.`),
    'application.withdrawn': (e) =>
      this.notifyApplicants(e, 'Đã rút hồ sơ', 'Hồ sơ đã được rút. Bạn có thể nộp lại khi cơ hội còn hạn.'),
  };

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), 5000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await relayOutboxBatch(this.outbox, this.handlers, this.logger);
    } catch (err: any) {
      this.logger.error(`[Outbox] Không quét được outbox: ${err.message}`);
    } finally {
      this.running = false;
    }
  }

  /** The applicant, plus every team member for a team application. */
  private async notifyApplicants(event: OutboxEvent, title: string, body: string) {
    const memberIds = Array.isArray(event.data.memberIds) ? (event.data.memberIds as unknown[]).map(String) : [];
    const recipients = [...new Set([String(event.data.studentId ?? ''), ...memberIds].filter(Boolean))];
    const applicationId = String(event.data.applicationId ?? event.aggregateId);
    for (const userId of recipients) {
      await this.send({
        userId,
        businessKey: `${event.type}:${event.eventId}`,
        type: event.type.toUpperCase().replace('.', '_'),
        title,
        body,
        refUrl: `/applications/${applicationId}`,
      });
    }
  }
}
