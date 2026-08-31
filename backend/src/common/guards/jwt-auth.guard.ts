import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { AppStore } from '../../db/app-store.js';
import type { AuthUser } from '../auth/auth-user.js';
import { IS_PUBLIC_KEY } from '../auth/public.decorator.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly store: AppStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Missing access token');
    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(token, {
        secret: env.JWT_ACCESS_SECRET,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
      const user = this.store.users.get(payload.sub);
      if (!user || user.status !== 'active' || user.tokenVersion !== payload.tokenVersion) {
        throw new Error('Account state changed');
      }
      request.user = { ...payload, role: user.role };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
