import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BillingServiceModule } from './billing-service.module';
import { GlobalExceptionFilter, CorrelationIdInterceptor } from '@shared';

async function bootstrap() {
  const logger = new Logger('BillingMicroservice');
  const app = await NestFactory.create(BillingServiceModule);

  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new CorrelationIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Billing Microservice (Port 3004)')
    .setDescription('Dịch vụ quản lý ví số nguyên VND, thanh toán sandbox, giữ/thu hồi tiền (Hold/Capture) và gói SKU.')
    .setVersion('3.2')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.BILLING_SERVICE_PORT || 3004;
  await app.listen(port);
  logger.log(`🚀 Billing Microservice running on: http://localhost:${port}`);
  logger.log(`📚 Billing Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
