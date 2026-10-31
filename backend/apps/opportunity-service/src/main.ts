import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { OpportunityServiceModule } from './opportunity-service.module';
import { GlobalExceptionFilter, CorrelationIdInterceptor } from '@shared';

async function bootstrap() {
  const logger = new Logger('OpportunityMicroservice');
  const app = await NestFactory.create(OpportunityServiceModule);

  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new CorrelationIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  // Connect gRPC Transport for High-Load Microservices Communication
  const grpcPort = process.env.OPPORTUNITY_GRPC_PORT || 50052;
  const protoPath = join(process.cwd(), 'libs/shared/src/protos/opportunity.proto');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'scholink.opportunity',
      protoPath,
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  const config = new DocumentBuilder()
    .setTitle('Opportunity Microservice (Port 3002 & gRPC 50052)')
    .setDescription('Dịch vụ quản lý danh mục học bổng, cuộc thi, crawler & kiểm duyệt, nộp hồ sơ trực tuyến.')
    .setVersion('3.2')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.startAllMicroservices();

  const port = process.env.OPPORTUNITY_SERVICE_PORT || 3002;
  await app.listen(port);
  logger.log(`🚀 Opportunity Microservice HTTP running on: http://localhost:${port}`);
  logger.log(`⚡ Opportunity Microservice gRPC running on: 0.0.0.0:${grpcPort}`);
  logger.log(`📚 Opportunity Swagger UI: http://localhost:${port}/docs`);
}

bootstrap();
