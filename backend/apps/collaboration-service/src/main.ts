import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CollaborationServiceModule } from './collaboration-service.module';
import { GlobalExceptionFilter, CorrelationIdInterceptor } from '@shared';

async function bootstrap() {
  const logger = new Logger('CollaborationMicroservice');
  const app = await NestFactory.create(CollaborationServiceModule);

  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new CorrelationIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Collaboration Microservice (Port 3003)')
    .setDescription('Dịch vụ quản lý đội thi (Team-Up), ghép đội, phòng chat đội và signaling gọi thời gian thực.')
    .setVersion('3.2')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.COLLABORATION_SERVICE_PORT || 3003;
  await app.listen(port);
  logger.log(`🚀 Collaboration Microservice running on: http://localhost:${port}`);
  logger.log(`📚 Collaboration Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
