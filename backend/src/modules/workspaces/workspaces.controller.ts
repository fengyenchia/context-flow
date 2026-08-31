import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { CreateWorkspaceDto, InviteMemberDto, UpdateMemberDto, UpdateWorkspaceDto } from './workspaces.dto.js';
import { WorkspacesService } from './workspaces.service.js';

@ApiTags('workspaces')
@Controller()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get('workspaces')
  list(@Req() request: AuthenticatedRequest) { return this.workspaces.list(request.user.sub); }

  @Post('workspaces')
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateWorkspaceDto) { return this.workspaces.create(request.user.sub, dto); }

  @Get('workspaces/:workspaceId')
  get(@Req() request: AuthenticatedRequest, @Param('workspaceId') id: string) { return this.workspaces.get(request.user.sub, id); }

  @Patch('workspaces/:workspaceId')
  update(@Req() request: AuthenticatedRequest, @Param('workspaceId') id: string, @Body() dto: UpdateWorkspaceDto) { return this.workspaces.update(request.user.sub, id, dto.name); }

  @Delete('workspaces/:workspaceId')
  remove(@Req() request: AuthenticatedRequest, @Param('workspaceId') id: string) { return this.workspaces.remove(request.user.sub, id); }

  @Post('workspaces/:workspaceId/invitations')
  invite(@Req() request: AuthenticatedRequest, @Param('workspaceId') id: string, @Body() dto: InviteMemberDto) { return this.workspaces.invite(request.user.sub, id, dto); }

  @Get('workspace-invitations')
  invitations(@Req() request: AuthenticatedRequest) { return this.workspaces.listInvitations(request.user.sub); }

  @Post('workspace-invitations/:invitationId/accept')
  accept(@Req() request: AuthenticatedRequest, @Param('invitationId') id: string) { return this.workspaces.respond(request.user.sub, id, true); }

  @Post('workspace-invitations/:invitationId/decline')
  decline(@Req() request: AuthenticatedRequest, @Param('invitationId') id: string) { return this.workspaces.respond(request.user.sub, id, false); }

  @Patch('workspaces/:workspaceId/members/:userId')
  updateMember(@Req() request: AuthenticatedRequest, @Param('workspaceId') workspaceId: string, @Param('userId') userId: string, @Body() dto: UpdateMemberDto) { return this.workspaces.updateMember(request.user.sub, workspaceId, userId, dto); }

  @Delete('workspaces/:workspaceId/members/:userId')
  removeMember(@Req() request: AuthenticatedRequest, @Param('workspaceId') workspaceId: string, @Param('userId') userId: string) { return this.workspaces.removeMember(request.user.sub, workspaceId, userId); }
}
