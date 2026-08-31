import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { StorageController } from './storage.controller.js';
import { StorageService } from './storage.service.js';

@Module({ imports: [WorkspacesModule], controllers: [StorageController], providers: [StorageService] })
export class StorageModule {}
