import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IdentityServiceModule } from './identity-service.module';
import { GlobalExceptionFilter, CorrelationIdInterceptor } from '@shared';

async function bootstrap() {
  const logger = new Logger('IdentityMicroservice');
  const app = await NestFactory.create(IdentityServiceModule);

  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new CorrelationIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Identity Microservice (Port 3001)')
    .setDescription('Dịch vụ quản lý xác thực tài khoản, quyền hạn, Passport sinh viên và Consent snapshot.')
    .setVersion('3.2')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.IDENTITY_SERVICE_PORT || 3001;
  await app.listen(port);
  logger.log(`🚀 Identity Microservice running on: http://localhost:${port}`);
  logger.log(`📚 Identity Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
