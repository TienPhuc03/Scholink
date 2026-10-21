import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import * as path from 'path';
import { SharedModule } from '@shared';
import { HealthController } from './health.controller';
import { PortalController } from './portal.controller';
import { GrpcGatewayController } from './grpc-gateway.controller';
import { ReverseProxyMiddleware } from './proxy.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SharedModule,
    ClientsModule.register([
      {
        name: 'COLLABORATION_GRPC_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'collaboration',
          protoPath: path.join(process.cwd(), 'proto/collaboration.proto'),
          url: process.env.COLLABORATION_GRPC_URL || 'localhost:50053',
        },
      },
      {
        name: 'IDENTITY_GRPC_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'identity',
          protoPath: path.join(process.cwd(), 'proto/identity.proto'),
          url: process.env.IDENTITY_GRPC_URL || 'localhost:50051',
        },
      },
    ]),
  ],
  controllers: [HealthController, PortalController, GrpcGatewayController],
  providers: [ReverseProxyMiddleware],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ReverseProxyMiddleware).forRoutes('*');
  }
}

