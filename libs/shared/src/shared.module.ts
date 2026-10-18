import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CryptoService } from './infrastructure/security/crypto.service';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from './infrastructure/guards/roles.guard';
import { IdempotencyGuard } from './infrastructure/guards/idempotency.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'scholink-jwt-secret-key-at-least-32-chars-long'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m'),
        },
      }),
    }),
  ],
  providers: [CryptoService, JwtAuthGuard, RolesGuard, IdempotencyGuard],
  exports: [JwtModule, CryptoService, JwtAuthGuard, RolesGuard, IdempotencyGuard],
})
export class SharedModule {}
