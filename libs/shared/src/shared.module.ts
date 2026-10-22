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
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32 || secret.startsWith('<REPLACE_')) {
          throw new Error(
            'Khởi tạo JwtModule thất bại: JWT_SECRET bắt buộc được cấu hình tối thiểu 32 ký tự trong biến môi trường.',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') as any,
          },
        };
      },
    }),
  ],
  providers: [CryptoService, JwtAuthGuard, RolesGuard, IdempotencyGuard],
  exports: [JwtModule, CryptoService, JwtAuthGuard, RolesGuard, IdempotencyGuard],
})
export class SharedModule {}
