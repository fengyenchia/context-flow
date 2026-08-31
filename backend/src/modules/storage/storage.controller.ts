import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { AppStore } from '../../db/app-store.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { CreateUploadUrlDto } from './storage.dto.js';
import { StorageService } from './storage.service.js';

@ApiTags('knowledge')
@Controller('projects/:projectId/knowledge')
export class StorageController {
  constructor(private readonly storage: StorageService, private readonly store: AppStore, private readonly workspaces: WorkspacesService) {}

  @Post('upload-url')
  uploadUrl(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string, @Body() dto: CreateUploadUrlDto) {
    const project = this.store.requireProject(projectId);
    this.workspaces.requireRole(project.workspaceId, request.user.sub, ['owner', 'admin', 'editor']);
    return this.storage.createUploadUrl(projectId, dto.fileName, dto.contentType);
  }
}
