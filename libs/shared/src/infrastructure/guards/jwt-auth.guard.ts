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
  userId: string;
  email: string;
  role: 'STUDENT' | 'ORGANIZER' | 'ADMIN';
  sessionId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new DomainException(
        ErrorCode.LOGIN_REQUIRED,
        'Yêu cầu đăng nhập để thực hiện thao tác này',
        401,
      );
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = this.jwtService.verify(token);
      (request as any).user = {
        userId: payload.sub || payload.userId,
        email: payload.email,
        role: payload.role,
        sessionId: payload.sessionId,
      } as AuthenticatedUser;

      return true;
    } catch (err) {
      throw new DomainException(
        ErrorCode.UNAUTHENTICATED,
        'Token xác thực không hợp lệ hoặc đã hết hạn',
        401,
      );
    }
  }
}
