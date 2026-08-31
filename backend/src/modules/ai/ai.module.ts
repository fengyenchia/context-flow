import { Module } from '@nestjs/common';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';

@Module({ imports: [AiCredentialsModule], controllers: [AiController], providers: [AiService] })
export class AiModule {}
