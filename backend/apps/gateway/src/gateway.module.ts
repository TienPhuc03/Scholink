import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { SharedModule } from '@shared';
import { HealthController } from './health.controller';
import { PortalController } from './portal.controller';
import { GrpcGatewayController } from './grpc-gateway.controller';
import { ReverseProxyMiddleware } from './proxy.middleware';
import {
  GATEWAY_IDENTITY_GRPC,
  GATEWAY_OPPORTUNITY_GRPC,
} from './grpc-clients.interface';
import { GatewayAuthController } from './controllers/gateway-auth.controller';
import { GatewayProfileController } from './controllers/gateway-profile.controller';
import { GatewayMediaController } from './controllers/gateway-media.controller';
import { GatewayOpportunityController } from './controllers/gateway-opportunity.controller';
import { GatewayApplicationController } from './controllers/gateway-application.controller';
import { GatewayTeamController } from './controllers/gateway-team.controller';
import { GatewayChatController } from './controllers/gateway-chat.controller';
import { GatewayBillingController } from './controllers/gateway-billing.controller';
import { GatewayNotificationController } from './controllers/gateway-notification.controller';
import { GatewayAdminOrgController } from './controllers/gateway-admin-org.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
      {
        name: 'COLLABORATION_GRPC_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'collaboration',
            protoPath: join(process.cwd(), 'proto/collaboration.proto'),
            url: config.get<string>('COLLABORATION_GRPC_URL', 'localhost:50053'),
          },
        }),
      },
      {
        name: 'IDENTITY_GRPC_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'identity',
            protoPath: join(process.cwd(), 'proto/identity.proto'),
            url: config.get<string>('IDENTITY_GRPC_URL', 'localhost:50051'),
          },
        }),
      },
    ]),
  ],
  controllers: [
    HealthController,
    PortalController,
    GrpcGatewayController,
    GatewayAuthController,
    GatewayProfileController,
    GatewayMediaController,
    GatewayOpportunityController,
    GatewayApplicationController,
    GatewayTeamController,
    GatewayChatController,
    GatewayBillingController,
    GatewayNotificationController,
    GatewayAdminOrgController,
  ],
  providers: [ReverseProxyMiddleware],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ReverseProxyMiddleware).forRoutes('*');
  }
}
