import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { OpportunityServiceModule } from './opportunity-service.module';

async function bootstrap() {
  const logger = new Logger('OpportunityGrpcMicroservice');
  const grpcUrl = process.env.OPPORTUNITY_GRPC_URL || '0.0.0.0:50052';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    OpportunityServiceModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'scholink.opportunity',
        protoPath: join(process.cwd(), 'libs/shared/src/protos/opportunity.proto'),
        url: grpcUrl,
      },
    },
  );

  await app.listen();
  logger.log(`🚀 Opportunity gRPC Microservice listening on: ${grpcUrl}`);
}

bootstrap();
