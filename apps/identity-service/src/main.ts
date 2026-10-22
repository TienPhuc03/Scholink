import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { IdentityServiceModule } from './identity-service.module';

async function bootstrap() {
  const logger = new Logger('IdentityGrpcMicroservice');
  const grpcUrl = process.env.IDENTITY_GRPC_URL || '0.0.0.0:50051';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    IdentityServiceModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'scholink.identity',
        protoPath: join(process.cwd(), 'libs/shared/src/protos/identity.proto'),
        url: grpcUrl,
      },
    },
  );

  await app.listen();
  logger.log(`🚀 Identity gRPC Microservice listening on: ${grpcUrl}`);
}

bootstrap();
