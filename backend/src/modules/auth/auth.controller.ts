import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { Public } from '../../common/auth/public.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { AuthService } from './auth.service.js';
import { LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto.username, dto.password, request.headers['user-agent'], request.ip);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(request.cookies?.contextflow_refresh, request.headers['user-agent'], request.ip);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.auth.logout(request.cookies?.contextflow_refresh);
    response.clearCookie('contextflow_refresh', { path: '/api/v1/auth' });
    return { ok: true };
  }

  @Post('logout-all')
  logoutAll(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    this.auth.logoutAll(request.user.sub);
    response.clearCookie('contextflow_refresh', { path: '/api/v1/auth' });
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
    return { ok: true };
  }

  private setRefreshCookie(response: Response, token: string) {
    response.cookie('contextflow_refresh', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: env.JWT_REFRESH_TTL_SECONDS * 1000,
    });
  }
}
