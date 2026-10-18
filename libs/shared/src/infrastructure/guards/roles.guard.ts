import { Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainException } from '../../domain/domain.exception';
import { AuthenticatedUser } from './jwt-auth.guard';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: ('STUDENT' | 'ORGANIZER' | 'ADMIN')[]) =>
  SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!user) {
      throw DomainException.forbiddenRole('Chưa đăng nhập');
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw DomainException.forbiddenRole(
        `Yêu cầu quyền ${requiredRoles.join(' hoặc ')}, vai trò hiện tại là ${user.role}`,
      );
    }

    return true;
  }
}
