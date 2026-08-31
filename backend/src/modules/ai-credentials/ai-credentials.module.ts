import { Module } from '@nestjs/common';
import { AiCredentialsController } from './ai-credentials.controller.js';
import { AiCredentialsService } from './ai-credentials.service.js';

@Module({
  controllers: [AiCredentialsController],
  providers: [AiCredentialsService],
  exports: [AiCredentialsService],
})
export class AiCredentialsModule {}
