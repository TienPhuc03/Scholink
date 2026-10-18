import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedModule, DatabaseModule } from '@shared';
import { NotificationModel, NotificationSchema } from './infrastructure/persistence/notification.schema';
import { NOTIFICATION_REPOSITORY } from './domain/ports/notification.repository.port';
import { MongooseNotificationRepository } from './infrastructure/persistence/notification.repository';
import { NotificationUseCase } from './application/use-cases/notification.use-case';
import { NotificationController } from './presentation/notification.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule.forService('NOTIFICATION_DB_NAME', 'scholink_notification'),
    SharedModule,
    MongooseModule.forFeature([
      { name: NotificationModel.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationUseCase,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: MongooseNotificationRepository,
    },
  ],
  exports: [NotificationUseCase, NOTIFICATION_REPOSITORY],
})
export class NotificationServiceModule {}
