import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { CreateProjectDto } from '../workspaces/workspaces.dto.js';
import { ProjectsService } from './projects.service.js';
import { CanvasSnapshotDto } from './canvas.dto.js';

@ApiTags('projects')
@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('workspaces/:workspaceId/projects')
  list(@Req() request: AuthenticatedRequest, @Param('workspaceId') id: string) { return this.projects.list(request.user.sub, id); }

  @Post('workspaces/:workspaceId/projects')
  create(@Req() request: AuthenticatedRequest, @Param('workspaceId') id: string, @Body() dto: CreateProjectDto) { return this.projects.create(request.user.sub, id, dto); }

  @Get('projects/:projectId')
  get(@Req() request: AuthenticatedRequest, @Param('projectId') id: string) { return this.projects.get(request.user.sub, id); }

  @Get('projects/:projectId/canvas')
  getCanvas(@Req() request: AuthenticatedRequest, @Param('projectId') id: string) { return this.projects.getCanvas(request.user.sub, id); }

  @Put('projects/:projectId/canvas')
  saveCanvas(@Req() request: AuthenticatedRequest, @Param('projectId') id: string, @Body() dto: CanvasSnapshotDto) { return this.projects.saveCanvas(request.user.sub, id, dto); }
}
