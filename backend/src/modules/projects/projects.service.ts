import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppStore } from '../../db/app-store.js';
import type { CreateProjectDto } from '../workspaces/workspaces.dto.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly store: AppStore, private readonly workspaces: WorkspacesService) {}

  list(userId: string, workspaceId: string) {
    this.workspaces.requireRole(workspaceId, userId, ['owner', 'admin', 'editor', 'viewer']);
    return [...this.store.projects.values()].filter((project) => project.workspaceId === workspaceId);
  }

  create(userId: string, workspaceId: string, dto: CreateProjectDto) {
    this.workspaces.requireRole(workspaceId, userId, ['owner', 'admin', 'editor']);
    const project = { id: randomUUID(), workspaceId, createdByUserId: userId, name: dto.name.trim(), description: dto.description?.trim() ?? '', layoutDirection: dto.layoutDirection, createdAt: new Date() };
    this.store.projects.set(project.id, project);
    return { ...project, roomId: `project:${project.id}` };
  }

  get(userId: string, projectId: string) {
    const project = this.store.requireProject(projectId);
    const membership = this.workspaces.requireRole(project.workspaceId, userId, ['owner', 'admin', 'editor', 'viewer']);
    return { ...project, roomId: `project:${project.id}`, role: membership.role };
  }
}
