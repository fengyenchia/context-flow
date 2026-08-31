import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { AiService } from './ai.service.js';
import { ChatDto } from './ai.dto.js';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  chat(@Req() request: AuthenticatedRequest, @Body() dto: ChatDto) {
    return this.ai.chat(request.user.sub, dto.prompt);
  }
}
