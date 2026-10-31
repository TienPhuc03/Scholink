import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NotificationServiceModule } from './notification-service.module';
import { GlobalExceptionFilter, CorrelationIdInterceptor } from '@shared';

async function bootstrap() {
  const logger = new Logger('NotificationMicroservice');
  const app = await NestFactory.create(NotificationServiceModule);

  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new CorrelationIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Notification Microservice (Port 3005)')
    .setDescription('Dịch vụ quản lý thông báo in-app, nhắc hạn deadline (T-7, T-3, T-1) và cầu nối MQTT realtime.')
    .setVersion('3.2')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.NOTIFICATION_SERVICE_PORT || 3005;
  await app.listen(port);
  logger.log(`🚀 Notification Microservice running on: http://localhost:${port}`);
  logger.log(`📚 Notification Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
