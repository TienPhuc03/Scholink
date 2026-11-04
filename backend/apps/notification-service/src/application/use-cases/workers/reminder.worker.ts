import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Worker, Job } from "bullmq";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ConfigService } from "@nestjs/config";
import {
  NotificationModel,
  NotificationDocument,
} from "../../../infrastructure/persistence/notification.schema";

@Injectable()
export class ReminderWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker;

  constructor(
    @InjectModel(NotificationModel.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    // Khởi tạo Worker thuần túy của BullMQ để tránh lỗi type với WorkerHost
    const redisHost = this.configService.get<string>("REDIS_HOST", "localhost");
    const redisPort = this.configService.get<number>("REDIS_PORT", 6379);

    this.worker = new Worker(
      "reminder-queue",
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

    console.log(
      "[ReminderWorker] Đã khởi động Worker lắng nghe hàng đợi thành công!",
    );
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processJob(job: Job): Promise<any> {
    const { userId, opportunityId, version, reason, plannedSendAt, dueAt } =
      job.data;

    const opportunity = await this.fetchOpportunityStatus(opportunityId);
    if (
      !opportunity ||
      opportunity.status === "CANCELLED" ||
      opportunity.version !== version
    ) {
      console.log(
        `Bỏ qua gửi nhắc nhở ${job.id} do cơ hội đã hủy hoặc đổi version.`,
      );
      return;
    }

    if (Date.now() > new Date(opportunity.deadline).getTime()) {
      console.log(`Không gửi nhắc nhở sau hạn.`);
      return;
    }

    // Ghi Inbox
    await this.createInboxMessage(userId, opportunityId, reason);

    if (plannedSendAt && reason !== "SUPPRESSED_QUIET_DEADLINE") {
      try {
        await this.sendPushNotification(userId, opportunityId);
      } catch (error) {
        throw new Error("Lỗi Provider, yêu cầu Retry");
      }
    }
  }

  // CÁC HÀM XỬ LÝ NGHIỆP VỤ

  private async fetchOpportunityStatus(opportunityId: string): Promise<any> {
    return {
      status: "PUBLISHED",
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
      type: "REMINDER",
      userId,
      businessKey: opportunityId,
      title: "Nhắc nhở hạn chót",
      body: `Cơ hội của bạn sắp đến hạn chót. Hãy hoàn thành hồ sơ ngay!`,
      reason,
      isRead: false,
    });
    console.log(`[Inbox] Đã tạo thông báo lưu DB cho User ${userId}`);
  }

  private async sendPushNotification(
    userId: string,
    opportunityId: string,
  ): Promise<void> {
    console.log(`[Push] Đã đẩy thông báo Push cho User ${userId}`);
  }
}
