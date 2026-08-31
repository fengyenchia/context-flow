import { Controller, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { CollaborationService } from './collaboration.service.js';

@ApiTags('collaboration')
@Controller('projects/:projectId/collaboration')
export class CollaborationController {
  constructor(private readonly collaboration: CollaborationService) {}

  @Post('auth')
  async authorize(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string, @Res() response: Response) {
    const result = await this.collaboration.authorize(request.user.sub, projectId);
    response.status(result.status).type('application/json').send(result.body);
  }
}
