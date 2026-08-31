import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { UpdateUserRoleDto, UpdateUserStatusDto } from './admin.dto.js';
import { AdminService } from './admin.service.js';

@ApiTags('admin')
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  users() { return this.admin.listUsers(); }

  @Patch('users/:userId/status')
  status(@Req() request: AuthenticatedRequest, @Param('userId') id: string, @Body() dto: UpdateUserStatusDto) { return this.admin.setStatus(request.user.sub, id, dto.status); }

  @Patch('users/:userId/role')
  role(@Req() request: AuthenticatedRequest, @Param('userId') id: string, @Body() dto: UpdateUserRoleDto) { return this.admin.setRole(request.user.sub, id, dto.role); }

  @Post('users/:userId/revoke-sessions')
  revoke(@Param('userId') id: string) { return this.admin.revokeSessions(id); }

  @Post('users/:userId/password-reset')
  reset(@Req() request: AuthenticatedRequest, @Param('userId') id: string) { return this.admin.createPasswordReset(request.user.sub, id); }

  @Get('audit-logs')
  audit() { return this.admin.auditLogs(); }
}
