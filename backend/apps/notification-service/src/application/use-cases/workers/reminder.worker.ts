import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  NotificationModel,
  NotificationDocument,
  ReminderModel,
  ReminderDocument,
  NotificationPreferenceModel,
  NotificationPreferenceDocument,
} from '../../../infrastructure/persistence/notification.schema';
import { BookmarkListener } from '../listeners/bookmark.listener';
import { MqttPushPublisher, PushMessage } from '../../../infrastructure/push/mqtt-push.publisher';

@Injectable()
export class ReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderWorker.name);
  private worker?: Worker;

  constructor(
    @InjectModel(NotificationModel.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(ReminderModel.name)
    private readonly reminderModel: Model<ReminderDocument>,
    private readonly configService: ConfigService,
    @Optional()
    @InjectModel(NotificationPreferenceModel.name)
    private readonly preferenceModel?: Model<NotificationPreferenceDocument>,
    @Optional()
    private readonly bookmarkListener?: BookmarkListener,
    @Optional()
    private readonly pushPublisher?: MqttPushPublisher,
  ) {}

  onModuleInit() {
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);

    try {
      this.worker = new Worker(
        'reminder-queue',
        async (job: Job) => {
          await this.processJob(job);
        },
        {
          connection: {
            host: redisHost,
            port: redisPort,
          },
        },
      );

      this.worker.on('error', (err) => {
        // Safe logging if Redis is disconnected
        this.logger.debug(`[ReminderWorker] Redis connection error: ${err.message}`);
      });

      this.logger.log('[ReminderWorker] Đã khởi động Worker lắng nghe hàng đợi nhắc nhở thành công!');
    } catch (err: any) {
      this.logger.warn(`Không thể khởi động BullMQ worker: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  public async processJob(job: Job): Promise<any> {
    const { userId, opportunityId, version, reason, plannedSendAt } = job.data;
    const offset: string | undefined =
      job.data.offsetLabel || (job.data.offset !== undefined ? `${job.data.offset}d` : undefined);

    // 1. Kiểm tra Reminder trong DB (đúng mốc offset): Nếu đã bị CANCELLED (do bỏ bookmark hoặc
    //    đổi version) hoặc đã SENT (job chạy lại sau retry) thì bỏ qua
    const reminderQuery: Record<string, unknown> = {
      userId,
      milestoneId: opportunityId,
      deadlineVersion: version,
    };
    if (offset) reminderQuery.offset = offset;
    const reminder = await this.reminderModel.findOne(reminderQuery);

    // Every job is created together with its reminder record; a job without one is left over
    // (record deleted, other database, stale queue) and must not message the user.
    if (!reminder) {
      this.logger.warn(`[ReminderWorker] Bỏ qua job ${job.id}: không có bản ghi nhắc tương ứng.`);
      return;
    }

    if (reminder && reminder.status === 'CANCELLED') {
      this.logger.log(`[ReminderWorker] Bỏ qua gửi nhắc nhở ${job.id} do reminder đã bị hủy (${reminder.reason}).`);
      return;
    }
    // Inbox already delivered; only a push that failed earlier may still be retried.
    const pushRetryOnly = reminder?.status === 'SENT' && reminder.pushStatus === 'PENDING_RETRY';
    if (reminder && reminder.status === 'SENT' && !pushRetryOnly) {
      this.logger.log(`[ReminderWorker] Nhắc nhở ${job.id} đã gửi trước đó, không gửi lại.`);
      return;
    }

    // NOTI-03: người dùng đổi timezone sau khi job được lập -> job cũ bị thay bằng job mới
    const jobPrefVersion = Number(job.data.preferenceVersion || 1);
    if (reminder && Number(reminder.preferenceVersion || 1) > jobPrefVersion) {
      this.logger.log(`[ReminderWorker] Bỏ qua job ${job.id} vì lịch nhắc đã được lập lại theo cài đặt mới.`);
      return;
    }

    // 2. Kiểm tra nếu có version mới hơn đã được phát hành -> bỏ qua job cũ (FR-NOTI-02: job cũ không gửi sau thay version)
    const newerReminder = await this.reminderModel.findOne({
      userId,
      milestoneId: opportunityId,
      deadlineVersion: { $gt: version },
    });
    if (newerReminder) {
      this.logger.log(`[ReminderWorker] Bỏ qua job cũ ${job.id} vì đã có version mới hơn (v${newerReminder.deadlineVersion}).`);
      return;
    }

    const pushWanted =
      Boolean(plannedSendAt) && reason !== 'SUPPRESSED_QUIET_DEADLINE' && (await this.isPushEnabled(userId));

    if (!pushRetryOnly) {
      // 3. Kiểm tra trạng thái cơ hội (không đoán: service không trả lời -> ném lỗi để BullMQ retry)
      const opportunity = await this.fetchOpportunityStatus(opportunityId);
      if (!opportunity || ['CANCELLED', 'REJECTED'].includes(opportunity.status)) {
        await this.cancel(reminder, opportunity ? 'OPPORTUNITY_CANCELLED' : 'OPPORTUNITY_NOT_FOUND');
        this.logger.log(`[ReminderWorker] Bỏ qua gửi nhắc nhở ${job.id} do cơ hội không còn hiệu lực.`);
        return;
      }

      if (Date.now() >= new Date(opportunity.deadline).getTime()) {
        this.logger.log(`[ReminderWorker] Không gửi nhắc nhở sau hạn.`);
        return;
      }

      // Hạn đã đổi mà sự kiện gia hạn chưa tới (mất sự kiện): không gửi mốc cũ, lập lại theo hạn mới.
      // So hạn thật chứ không so version: version còn tăng khi sửa tag/gộp bài (merge) mà hạn giữ nguyên.
      const plannedDeadline = reminder?.deadlineAt ? new Date(reminder.deadlineAt) : null;
      if (plannedDeadline && Math.abs(plannedDeadline.getTime() - new Date(opportunity.deadline).getTime()) > 1000) {
        await this.cancel(reminder, 'DEADLINE_CHANGED');
        this.logger.log(`[ReminderWorker] Hạn của ${opportunityId} đã đổi, lập lại nhắc thay vì gửi mốc cũ.`);
        if (this.bookmarkListener) {
          await this.bookmarkListener.handleBookmarkCreated({
            userId,
            opportunityId,
            deadline: opportunity.deadline,
            version: Math.max(Number(opportunity.version) || 1, Number(version) || 1),
            title: job.data.title,
          });
        }
        return;
      }

      // 4. Ghi Inbox Notification (mỗi mốc một thông báo, chống trùng bằng businessKey)
      const created = await this.createInboxMessage({
        userId,
        opportunityId,
        reason,
        version,
        offset: offset || 'deadline',
        title: job.data.title,
        deadline: opportunity.deadline,
      });

      // 5. Inbox và push ghi kết quả riêng (F26)
      if (reminder) {
        reminder.status = 'SENT';
        if (!reminder.pushStatus || reminder.pushStatus === 'PENDING_RETRY') {
          reminder.pushStatus = pushWanted && created ? 'PENDING' : 'SKIPPED';
        }
        await reminder.save();
      } else if (!created) {
        return; // no record to track push and the inbox message existed: do not push twice
      }
    }

    // 6. Đẩy Push Notification nếu ngoài giờ yên lặng và người dùng bật kênh push
    if (!pushWanted || reminder?.pushStatus === 'SENT' || reminder?.pushStatus === 'SKIPPED') return;
    try {
      const content = ReminderWorker.reminderContent({
        opportunityId,
        version,
        offset: offset || 'deadline',
        title: job.data.title,
      });
      await this.sendPushNotification(userId, {
        kind: 'notification',
        notificationKey: content.businessKey,
        title: content.title,
        body: content.body,
        refUrl: content.refUrl,
        sentAt: new Date().toISOString(),
      });
      if (reminder) {
        reminder.pushStatus = 'SENT';
        await reminder.save();
      }
    } catch (error) {
      // Provider lỗi: retry có giới hạn bằng attempts của BullMQ; lần cuối ghi FAILED.
      const attempts = Number(job.opts?.attempts ?? 1);
      const isLast = Number(job.attemptsMade ?? 0) + 1 >= attempts;
      if (reminder) {
        reminder.pushStatus = isLast ? 'FAILED' : 'PENDING_RETRY';
        await reminder.save();
      }
      this.logger.warn(
        `Lỗi đẩy push cho user ${userId} (lần ${Number(job.attemptsMade ?? 0) + 1}/${attempts}): ${error}`,
      );
      if (!isLast) throw error;
    }
  }

  private async cancel(reminder: any, reason: string): Promise<void> {
    if (!reminder) return;
    reminder.status = 'CANCELLED';
    reminder.reason = reason;
    if (typeof reminder.save === 'function') await reminder.save();
  }

  /**
   * Current state of the opportunity. Returns null when it no longer exists (404).
   * Throws when the Opportunity Service cannot be reached, so BullMQ retries the job later
   * (bounded by `attempts`) instead of sending with made-up data.
   */
  private async fetchOpportunityStatus(
    opportunityId: string,
  ): Promise<{ status: string; version: number; deadline: Date } | null> {
    const oppUrl = process.env.OPPORTUNITY_SERVICE_URL || 'http://localhost:3002';
    const res = await fetch(`${oppUrl}/api/v1/opportunities/${encodeURIComponent(opportunityId)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Opportunity Service trả ${res.status} khi kiểm tra ${opportunityId}`);
    const data = await res.json();
    return {
      status: data.status,
      version: data.version,
      deadline: new Date(data.registerDeadline),
    };
  }

  private async isPushEnabled(userId: string): Promise<boolean> {
    if (!this.preferenceModel) return true;
    try {
      const pref = await this.preferenceModel.findOne({ userId }).lean();
      return pref?.pushEnabled !== false;
    } catch {
      return true;
    }
  }

  /**
   * One inbox message per (opportunity, offset, deadline version). The businessKey used to be the
   * bare opportunityId, so the unique (userId, businessKey) index rejected the 3-day and 1-day
   * reminders after the 7-day one had been delivered.
   *
   * Returns false when the message already existed (job retried), so push is not sent twice.
   */
  /** Same text for the inbox message and its push, so a push retried later says the same thing. */
  static reminderContent(input: { opportunityId: string; version: number; offset: string; title?: string }): {
    businessKey: string;
    title: string;
    body: string;
    refUrl: string;
  } {
    const days = parseInt(input.offset, 10);
    const when = Number.isFinite(days)
      ? days <= 1
        ? 'còn khoảng 24 giờ'
        : `còn ${days} ngày`
      : 'sắp đến hạn';
    const name = input.title && input.title !== 'Nhắc nhở hạn chót' ? `"${input.title}"` : 'Cơ hội bạn đã lưu';
    return {
      businessKey: `reminder:${input.opportunityId}:${input.offset}:v${input.version || 1}`,
      // The milestone is in the title so stacked notifications (7d / 3d / 1d) are told apart.
      title: `Nhắc hạn (${when}): ${input.title && input.title !== 'Nhắc nhở hạn chót' ? input.title : 'cơ hội bạn đã lưu'}`,
      body: `${name} ${when} là đóng đăng ký. Hãy hoàn thành hồ sơ trước hạn!`,
      refUrl: `/opportunities/${input.opportunityId}`,
    };
  }

  private async createInboxMessage(input: {
    userId: string;
    opportunityId: string;
    reason: string;
    version: number;
    offset: string;
    title?: string;
    deadline?: Date;
  }): Promise<boolean> {
    const content = ReminderWorker.reminderContent(input);
    const businessKey = content.businessKey;

    try {
      await this.notificationModel.create({
        id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        type: 'DEADLINE_REMINDER',
        userId: input.userId,
        businessKey,
        title: content.title,
        body: content.body,
        refUrl: content.refUrl,
        reason: input.reason,
        isRead: false,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        this.logger.log(`[Inbox] Thông báo ${businessKey} đã tồn tại cho User ${input.userId}, bỏ qua.`);
        return false;
      }
      throw err;
    }
    this.logger.log(`[Inbox] Đã tạo thông báo ${businessKey} cho User ${input.userId}`);
    return true;
  }

  /**
   * Push over MQTT (EMQX). Throws when the broker cannot take it, so the job is retried.
   * Without a publisher (unit tests, broker not configured) nothing is sent: logged only.
   */
  private async sendPushNotification(userId: string, message: PushMessage): Promise<void> {
    if (!this.pushPublisher) {
      this.logger.log(`[Push] Chưa cấu hình broker, bỏ qua push ${message.notificationKey} cho User ${userId}`);
      return;
    }
    await this.pushPublisher.publishToUser(userId, message);
  }
}
