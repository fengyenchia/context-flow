import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest, GlobalRole } from '../auth/auth-user.js';
import { ROLES_KEY } from '../auth/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<GlobalRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!roles.includes(user.role)) throw new ForbiddenException('Insufficient global role');
    return true;
  }
}
