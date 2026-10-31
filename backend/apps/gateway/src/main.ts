import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GatewayModule } from './gateway.module';
import { GlobalExceptionFilter, CorrelationIdInterceptor } from '@shared';

async function bootstrap() {
  const logger = new Logger('ScholinkApiGateway');
  const app = await NestFactory.create(GatewayModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalInterceptors(new CorrelationIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Scholink Microservices API Gateway')
    .setDescription(
      'Cổng API Gateway điều phối 5 Microservices nghiệp vụ: Identity (3001), Opportunity (3002), Collaboration (3003), Billing (3004), Notification (3005).',
    )
    .setVersion('3.2')
    .addBearerAuth()
    .addTag('Gateway Health', 'Kiểm tra trạng thái Gateway & Microservices')
    .addTag('Auth (Identity Service)', 'Đăng ký, đăng nhập, phân quyền, refresh token')
    .addTag('Profile & Passport (Identity Service)', 'Hồ sơ Passport, độ hoàn thiện, Consent snapshot')
    .addTag('Opportunity Catalog (Opportunity Service)', 'Danh mục học bổng & cuộc thi, bộ lọc cursor-based')
    .addTag('Application (Opportunity Service)', 'Nộp hồ sơ ứng tuyển, rút hồ sơ, quản lý trạng thái')
    .addTag('Team & Collaboration (Collaboration Service)', 'Tạo đội thi, tìm đồng đội Team-Up, gia nhập đội')
    .addTag('Chat & Messages (Collaboration Service)', 'Phòng chat đội thi, tin nhắn trực tiếp')
    .addTag('Wallet & Billing (Billing Service)', 'Ví VND, nạp tiền sandbox, mua gói SKU Plus/Boost')
    .addTag('Notifications (Notification Service)', 'Thông báo trong ứng dụng, nhắc hạn deadline')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.GATEWAY_PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Scholink API Gateway running on: http://localhost:${port}`);
  logger.log(`📚 Gateway Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
