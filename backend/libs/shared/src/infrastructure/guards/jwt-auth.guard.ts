import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DomainException, ErrorCode } from '../../domain/domain.exception';
import { RedisService } from '../redis/redis.service';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface AuthenticatedUser {
  readonly userId: string;
  readonly email: string;
  readonly role: 'STUDENT' | 'ORGANIZER' | 'ADMIN';
  readonly sessionId?: string;
  readonly familyId?: string;
  readonly organizationId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Mục 26 & 29 SRS: Xóa mọi header x-user-* do client tự đặt để chống giả mạo danh tính
    for (const headerKey of Object.keys(request.headers)) {
      if (headerKey.toLowerCase().startsWith('x-user-')) {
        delete request.headers[headerKey];
      }
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (isPublic) {
        return true;
      }
      throw new DomainException(
        ErrorCode.LOGIN_REQUIRED,
        'Yêu cầu đăng nhập để thực hiện thao tác này',
        401,
      );
    }

    const token = authHeader.slice(7).trim();
    try {
      const payload = this.jwtService.verify<{
        sub?: string;
        userId?: string;
        email: string;
        role: 'STUDENT' | 'ORGANIZER' | 'ADMIN';
        sessionId?: string;
        familyId?: string;
        organizationId?: string;
        iat?: number;
        typ?: string;
      }>(token);

      const authenticatedUser: AuthenticatedUser = Object.freeze({
        userId: payload.sub || payload.userId || '',
        email: payload.email,
        role: payload.role,
        sessionId: payload.sessionId,
        familyId: payload.familyId,
        organizationId: payload.organizationId,
      });

      if (!authenticatedUser.userId || !authenticatedUser.role || payload.typ !== 'access') {
        throw new Error('Invalid token claims');
      }

      // SCHOL-14: Kiểm tra trạng thái thu hồi phiên hoặc quyền tài khoản từ Redis nếu khả dụng
      if (this.redisService?.isAvailable) {
        if (authenticatedUser.familyId) {
          const isRevoked = await this.redisService.get(`revoked_family:${authenticatedUser.familyId}`);
          if (isRevoked) {
            throw new DomainException(
              ErrorCode.UNAUTHENTICATED,
              'Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại',
              401,
            );
          }
        }
        if (authenticatedUser.userId) {
          // Only tokens issued before the revocation are rejected, so logging in again still works.
          // iat has 1 s precision: a login in the same second as the revocation stays valid.
          const revokedBefore = await this.redisService.get(`revoked_before:${authenticatedUser.userId}`);
          if (revokedBefore && !(Number(payload.iat) >= Number(revokedBefore))) {
            throw new DomainException(
              ErrorCode.UNAUTHENTICATED,
              'Quyền hoặc thành viên của tài khoản đã bị thu hồi, vui lòng đăng nhập lại',
              401,
            );
          }
        }
      }

      (request as unknown as { user: AuthenticatedUser }).user = authenticatedUser;
      return true;
    } catch (err: any) {
      if (err instanceof DomainException) {
        throw err;
      }
      if (isPublic) {
        return true;
      }
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Token xác thực không hợp lệ hoặc đã hết hạn',
        401,
      );
    }
  }
}
