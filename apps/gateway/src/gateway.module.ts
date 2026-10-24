import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { SharedModule, validateEnv } from '@shared';
import { HealthController } from './health.controller';
import {
  GATEWAY_IDENTITY_GRPC,
  GATEWAY_OPPORTUNITY_GRPC,
} from './grpc-clients.interface';
import { GatewayAuthController } from './controllers/gateway-auth.controller';
import { GatewayProfileController } from './controllers/gateway-profile.controller';
import { GatewayMediaController } from './controllers/gateway-media.controller';
import { GatewayOpportunityController } from './controllers/gateway-opportunity.controller';
import { GatewayApplicationController } from './controllers/gateway-application.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    SharedModule,
    ClientsModule.registerAsync([
      {
        name: GATEWAY_IDENTITY_GRPC,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'scholink.identity',
            protoPath: join(process.cwd(), 'libs/shared/src/protos/identity.proto'),
            url: config.get<string>('IDENTITY_GRPC_URL', 'localhost:50051'),
          },
        }),
      },
      {
        name: GATEWAY_OPPORTUNITY_GRPC,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'scholink.opportunity',
            protoPath: join(process.cwd(), 'libs/shared/src/protos/opportunity.proto'),
            url: config.get<string>('OPPORTUNITY_GRPC_URL', 'localhost:50052'),
          },
        }),
      },
    ]),
  ],
  controllers: [
    HealthController,
    GatewayAuthController,
    GatewayProfileController,
    GatewayMediaController,
    GatewayOpportunityController,
    GatewayApplicationController,
  ],
})
export class GatewayModule {}
