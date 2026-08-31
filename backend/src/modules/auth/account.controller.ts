import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { AppStore } from '../../db/app-store.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, UpdateProfileDto } from './auth.dto.js';

@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private readonly store: AppStore, private readonly auth: AuthService) {}

  @Get()
  getAccount(@Req() request: AuthenticatedRequest) {
    return this.store.publicUser(this.store.requireUser(request.user.sub));
  }

  @Patch('profile')
  updateProfile(@Req() request: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    const user = this.store.requireUser(request.user.sub);
    if (dto.displayName) user.displayName = dto.displayName.trim();
    return this.store.publicUser(user);
  }

  @Patch('password')
  async changePassword(@Req() request: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(request.user.sub, dto);
    return { ok: true, reauthenticate: true };
  }
}
