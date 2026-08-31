import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Liveblocks } from '@liveblocks/node';
import { env } from '../../config/env.js';
import { AppStore } from '../../db/app-store.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';

@Injectable()
export class CollaborationService {
  constructor(private readonly store: AppStore, private readonly workspaces: WorkspacesService) {}

  async authorize(userId: string, projectId: string) {
    if (!env.LIVEBLOCKS_SECRET_KEY) throw new ServiceUnavailableException('Liveblocks is not configured');
    const project = this.store.requireProject(projectId);
    const membership = this.workspaces.requireRole(project.workspaceId, userId, ['owner', 'admin', 'editor', 'viewer']);
    const user = this.store.requireUser(userId);
    const liveblocks = new Liveblocks({ secret: env.LIVEBLOCKS_SECRET_KEY });
    const session = liveblocks.prepareSession(user.id, {
      userInfo: { name: user.displayName, username: user.username },
    });
    session.allow(`project:${project.id}`, membership.role === 'viewer' ? session.READ_ACCESS : session.FULL_ACCESS);
    return session.authorize();
  }
}
