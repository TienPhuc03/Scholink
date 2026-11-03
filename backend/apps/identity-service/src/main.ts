import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { IdentityServiceModule } from './identity-service.module';
import { GlobalExceptionFilter, CorrelationIdInterceptor } from '@shared';

async function bootstrap() {
  const logger = new Logger('IdentityMicroservice');
  const app = await NestFactory.create(IdentityServiceModule);

  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new CorrelationIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  // Connect gRPC Transport for East-West Microservices Communication
  const grpcPort = process.env.IDENTITY_GRPC_PORT || 50051;
  const protoPath = join(process.cwd(), 'libs/shared/src/protos/identity.proto');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'scholink.identity',
      protoPath,
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  const config = new DocumentBuilder()
    .setTitle('Identity Microservice (Port 3001 & gRPC 50051)')
    .setDescription('Dịch vụ quản lý xác thực tài khoản, quyền hạn, Passport sinh viên, Consent và gRPC endpoint.')
    .setVersion('3.2')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.startAllMicroservices();

  const port = process.env.IDENTITY_SERVICE_PORT || 3001;
  await app.listen(port);
  logger.log(`🚀 Identity Microservice HTTP running on: http://localhost:${port}`);
  logger.log(`⚡ Identity Microservice gRPC running on: 0.0.0.0:${grpcPort}`);
  logger.log(`📚 Identity Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
