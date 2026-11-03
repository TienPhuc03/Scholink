import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as path from 'path';
import { CollaborationServiceModule } from './collaboration-service.module';
import { GlobalExceptionFilter, CorrelationIdInterceptor } from '@shared';

async function bootstrap() {
  const logger = new Logger('CollaborationMicroservice');
  const app = await NestFactory.create(CollaborationServiceModule);

  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new CorrelationIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  // Connect gRPC Transport for High-Load East-West Communication
  const grpcPort = process.env.COLLABORATION_GRPC_PORT || 50053;
  const protoPath = path.join(process.cwd(), 'proto/collaboration.proto');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'collaboration',
      protoPath,
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  const config = new DocumentBuilder()
    .setTitle('Collaboration Microservice (Port 3003 & gRPC 50053)')
    .setDescription('Dịch vụ quản lý đội thi (Team-Up), ghép đội, phòng chat đội, Roster Freeze và gRPC endpoint.')
    .setVersion('3.2')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.startAllMicroservices();

  const port = process.env.COLLABORATION_SERVICE_PORT || 3003;
  await app.listen(port);
  logger.log(`🚀 Collaboration Microservice HTTP running on: http://localhost:${port}`);
  logger.log(`⚡ Collaboration Microservice gRPC running on: 0.0.0.0:${grpcPort}`);
  logger.log(`📚 Collaboration Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
