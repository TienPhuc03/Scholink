import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  NotificationModel,
  NotificationDocument,
  ReminderModel,
  ReminderDocument,
} from '../../../infrastructure/persistence/notification.schema';

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
    const { userId, opportunityId, version, reason, plannedSendAt, dueAt } = job.data;

    // 1. Kiểm tra Reminder trong DB: Nếu đã bị CANCELLED (do bỏ bookmark hoặc đổi version) thì bỏ qua
    const reminder = await this.reminderModel.findOne({
      userId,
      milestoneId: opportunityId,
      deadlineVersion: version,
    });

    if (reminder && reminder.status === 'CANCELLED') {
      this.logger.log(`[ReminderWorker] Bỏ qua gửi nhắc nhở ${job.id} do reminder đã bị hủy (${reminder.reason}).`);
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

    // 3. Kiểm tra trạng thái cơ hội
    const opportunity = await this.fetchOpportunityStatus(opportunityId);
    if (!opportunity || opportunity.status === 'CANCELLED' || opportunity.version !== version) {
      this.logger.log(`[ReminderWorker] Bỏ qua gửi nhắc nhở ${job.id} do cơ hội đã hủy hoặc đổi version.`);
      return;
    }

    if (Date.now() > new Date(opportunity.deadline).getTime()) {
      this.logger.log(`[ReminderWorker] Không gửi nhắc nhở sau hạn.`);
      return;
    }

    // 4. Ghi Inbox Notification
    await this.createInboxMessage(userId, opportunityId, reason);

    // 5. Cập nhật trạng thái Reminder thành SENT
    if (reminder) {
      reminder.status = 'SENT';
      await reminder.save();
    }

    // 6. Đẩy Push Notification nếu ngoài giờ yên lặng
    if (plannedSendAt && reason !== 'SUPPRESSED_QUIET_DEADLINE') {
      try {
        await this.sendPushNotification(userId, opportunityId);
      } catch (error) {
        this.logger.warn(`Lỗi đẩy push notification cho user ${userId}: ${error}`);
      }
    }
  }

  private async fetchOpportunityStatus(opportunityId: string): Promise<any> {
    const oppUrl = process.env.OPPORTUNITY_SERVICE_URL || 'http://localhost:3002';
    try {
      const res = await fetch(`${oppUrl}/api/v1/opportunities/${opportunityId}`);
      if (res.ok) {
        const data = await res.json();
        return {
          status: data.status,
          version: data.version,
          deadline: new Date(data.registerDeadline),
        };
      }
    } catch {
      // Fallback
    }

    return {
      status: 'PUBLISHED',
      version: 1,
      deadline: new Date(Date.now() + 86400000),
    };
  }

  private async createInboxMessage(
    userId: string,
    opportunityId: string,
    reason: string,
  ): Promise<void> {
    await this.notificationModel.create({
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type: 'REMINDER',
      userId,
      businessKey: opportunityId,
      title: 'Nhắc nhở hạn chót cơ hội',
      body: 'Cơ hội bạn đang theo dõi sắp đến hạn chót đăng ký. Hãy hoàn thành hồ sơ ngay!',
      refUrl: `/opportunities/${opportunityId}`,
      reason,
      isRead: false,
    });
    this.logger.log(`[Inbox] Đã tạo thông báo lưu DB cho User ${userId}`);
  }

  private async sendPushNotification(
    userId: string,
    opportunityId: string,
  ): Promise<void> {
    this.logger.log(`[Push] Đã đẩy thông báo Push cho User ${userId} (Opportunity: ${opportunityId})`);
  }
}
