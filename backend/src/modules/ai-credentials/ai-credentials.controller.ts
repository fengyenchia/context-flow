import { Body, Controller, Delete, Get, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../common/auth/auth-user.js';
import { SaveGeminiCredentialDto } from './ai-credentials.dto.js';
import { AiCredentialsService } from './ai-credentials.service.js';

@ApiTags('account')
@Controller('account/ai-credentials')
export class AiCredentialsController {
  constructor(private readonly credentials: AiCredentialsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.credentials.list(request.user.sub);
  }

  @Put('gemini')
  save(@Req() request: AuthenticatedRequest, @Body() dto: SaveGeminiCredentialDto) {
    return this.credentials.save(request.user.sub, dto.apiKey);
  }

  @Post('gemini/test')
  test(@Req() request: AuthenticatedRequest) {
    return this.credentials.testStored(request.user.sub);
  }

  @Delete('gemini')
  remove(@Req() request: AuthenticatedRequest) {
    this.credentials.remove(request.user.sub);
    return { ok: true };
  }
}
