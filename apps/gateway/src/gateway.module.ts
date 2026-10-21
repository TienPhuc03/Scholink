import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '@shared';
import { HealthController } from './health.controller';
import { PortalController } from './portal.controller';
import { ReverseProxyMiddleware } from './proxy.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SharedModule,
  ],
  controllers: [HealthController, PortalController],
  providers: [ReverseProxyMiddleware],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ReverseProxyMiddleware).forRoutes('*');
  }
}
