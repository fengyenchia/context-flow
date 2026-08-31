import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { CollaborationController } from './collaboration.controller.js';
import { CollaborationService } from './collaboration.service.js';

@Module({ imports: [WorkspacesModule], controllers: [CollaborationController], providers: [CollaborationService] })
export class CollaborationModule {}
