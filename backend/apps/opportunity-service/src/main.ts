import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { OpportunityServiceModule } from './opportunity-service.module';
import { GlobalExceptionFilter, CorrelationIdInterceptor } from '@shared';

async function bootstrap() {
  const logger = new Logger('OpportunityMicroservice');
  const app = await NestFactory.create(OpportunityServiceModule);

  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new CorrelationIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Opportunity Microservice (Port 3002)')
    .setDescription('Dịch vụ quản lý danh mục học bổng, cuộc thi, crawler & kiểm duyệt, nộp hồ sơ trực tuyến.')
    .setVersion('3.2')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.OPPORTUNITY_SERVICE_PORT || 3002;
  await app.listen(port);
  logger.log(`🚀 Opportunity Microservice running on: http://localhost:${port}`);
  logger.log(`📚 Opportunity Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
