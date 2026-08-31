import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { DataModule } from './db/data.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AiCredentialsModule } from './modules/ai-credentials/ai-credentials.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CollaborationModule } from './modules/collaboration/collaboration.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';

@Module({
  imports: [
    DataModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    AiCredentialsModule,
    WorkspacesModule,
    ProjectsModule,
    AdminModule,
    AiModule,
    CollaborationModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
