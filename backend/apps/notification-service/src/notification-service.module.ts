import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { BullModule } from "@nestjs/bullmq"; // <-- Cần có để tạo Queue cho BookmarkListener
import { EventEmitterModule } from "@nestjs/event-emitter";
import { SharedModule, DatabaseModule } from "@shared";

import {
  NotificationModel,
  NotificationSchema,
  ReminderModel,
  ReminderSchema,
  NotificationPreferenceModel,
  NotificationPreferenceSchema,
} from "./infrastructure/persistence/notification.schema";
import { NOTIFICATION_REPOSITORY } from "./domain/ports/notification.repository.port";
import { MongooseNotificationRepository } from "./infrastructure/persistence/notification.repository";
import { NotificationUseCase } from "./application/use-cases/notification.use-case";
import { NotificationController } from "./presentation/notification.controller";
import { NotificationPreferenceController } from "./presentation/notification-preference.controller";
import { NotificationPreferenceUseCase } from "./application/use-cases/notification-preference.use-case";

// Module F23
import { QuietHoursService } from "./application/use-cases/services/quiet-hours.service";
import { BookmarkListener } from "./application/use-cases/listeners/bookmark.listener";
import { ReminderWorker } from "./application/use-cases/workers/reminder.worker";
import { MqttPushPublisher } from "./infrastructure/push/mqtt-push.publisher";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule.forService("NOTIFICATION_DB_NAME", "scholink_notification"),
    SharedModule,

    // Đăng ký toàn bộ Schema của Notification và Reminder
    MongooseModule.forFeature([
      { name: NotificationModel.name, schema: NotificationSchema },
      { name: ReminderModel.name, schema: ReminderSchema },
      {
        name: NotificationPreferenceModel.name,
        schema: NotificationPreferenceSchema,
      },
    ]),

    // 1. Cấu hình kết nối Redis cho BullMQ
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),

    // 2. Đăng ký Queue "reminder-queue" để BookmarkListener tiêm (@InjectQueue) thành công
    BullModule.registerQueue({
      name: "reminder-queue",
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  // NotificationPreferenceController first: its static "preferences" path must win over
  // NotificationController's ":id" routes.
  controllers: [NotificationPreferenceController, NotificationController],
  providers: [
    NotificationUseCase,
    NotificationPreferenceUseCase,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: MongooseNotificationRepository,
    },
    QuietHoursService,
    BookmarkListener,
    ReminderWorker,
    // Push channel over EMQX (MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD). MQTT_PUSH_ENABLED=false
    // turns it off: reminders then go to the inbox only.
    {
      provide: MqttPushPublisher,
      useFactory: () => (process.env.MQTT_PUSH_ENABLED === 'false' ? null : new MqttPushPublisher()),
    },
  ],
  exports: [NotificationUseCase, NOTIFICATION_REPOSITORY, BullModule],
})
export class NotificationServiceModule {}
