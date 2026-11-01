import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CryptoService } from './infrastructure/security/crypto.service';
import { RedisService } from './infrastructure/redis/redis.service';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from './infrastructure/guards/roles.guard';
import { IdempotencyGuard } from './infrastructure/guards/idempotency.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret =
          config.get<string>('JWT_SECRET') ||
          process.env.JWT_SECRET ||
          'scholink-super-secret-jwt-key-minimum-32-chars-long!';
        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') as any,
          },
        };
      },
    }),
  ],
  providers: [CryptoService, RedisService, JwtAuthGuard, RolesGuard, IdempotencyGuard],
  exports: [JwtModule, CryptoService, RedisService, JwtAuthGuard, RolesGuard, IdempotencyGuard],
})
export class SharedModule {}
