import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DomainException, ErrorCode } from '../../domain/domain.exception';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface AuthenticatedUser {
  readonly userId: string;
  readonly email: string;
  readonly role: 'STUDENT' | 'ORGANIZER' | 'ADMIN';
  readonly sessionId?: string;
  readonly organizationId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
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
        organizationId?: string;
      }>(token);

      const authenticatedUser: AuthenticatedUser = Object.freeze({
        userId: payload.sub || payload.userId || '',
        email: payload.email,
        role: payload.role,
        sessionId: payload.sessionId,
        organizationId: payload.organizationId,
      });

      if (!authenticatedUser.userId || !authenticatedUser.role) {
        throw new Error('Invalid token claims');
      }

      (request as unknown as { user: AuthenticatedUser }).user = authenticatedUser;
      return true;
    } catch {
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
