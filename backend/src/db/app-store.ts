import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import type { GlobalRole, WorkspaceRole } from '../common/auth/auth-user.js';

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: GlobalRole;
  status: 'active' | 'suspended';
  tokenVersion: number;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  kind: 'personal' | 'shared';
  createdByUserId: string;
  createdAt: Date;
}

export interface MembershipRecord {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  name: string;
  description: string;
  layoutDirection: 'LR' | 'TB';
  createdAt: Date;
}

export interface InvitationRecord {
  id: string;
  workspaceId: string;
  targetUserId: string;
  invitedByUserId: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: Date;
}

export interface RefreshSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface AiCredentialRecord {
  userId: string;
  encryptedApiKey: string;
  encryptionIv: string;
  authTag: string;
  keyHint: string;
  status: 'active' | 'invalid';
  lastValidatedAt?: Date;
  updatedAt: Date;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  issuedByAdminId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
}

export interface CanvasSnapshotRecord {
  nodes: unknown[];
  edges: unknown[];
  convergenceNodes?: unknown[];
  convergenceEdges?: unknown[];
  resources?: unknown[];
  conversations?: Record<string, string[]>;
  summary?: string;
  updatedAt: Date;
}

@Injectable()
export class AppStore {
  readonly users = new Map<string, UserRecord>();
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly memberships = new Map<string, MembershipRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly invitations = new Map<string, InvitationRecord>();
  readonly sessions = new Map<string, RefreshSessionRecord>();
  readonly credentials = new Map<string, AiCredentialRecord>();
  readonly passwordResets = new Map<string, PasswordResetRecord>();
  readonly canvasSnapshots = new Map<string, CanvasSnapshotRecord>();
  readonly adminAudit: Record<string, unknown>[] = [];
  readonly workspaceAudit: Record<string, unknown>[] = [];

  constructor() {
    if (env.INITIAL_ADMIN_USERNAME && env.INITIAL_ADMIN_PASSWORD_HASH) {
      this.createUser({
        username: env.INITIAL_ADMIN_USERNAME,
        displayName: 'System administrator',
        passwordHash: env.INITIAL_ADMIN_PASSWORD_HASH,
        role: 'admin',
      });
    }
  }

  createUser(input: Pick<UserRecord, 'username' | 'displayName' | 'passwordHash'> & { role?: GlobalRole }) {
    const username = input.username.trim().toLowerCase();
    if (this.findUserByUsername(username)) throw new ConflictException('Username is already in use');
    const user: UserRecord = {
      id: randomUUID(),
      username,
      displayName: input.displayName.trim() || username,
      passwordHash: input.passwordHash,
      role: input.role ?? 'user',
      status: 'active',
      tokenVersion: 1,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    const workspace: WorkspaceRecord = {
      id: randomUUID(),
      name: `${user.displayName} 的工作區`,
      kind: 'personal',
      createdByUserId: user.id,
      createdAt: new Date(),
    };
    this.workspaces.set(workspace.id, workspace);
    this.setMembership(workspace.id, user.id, 'owner');
    return user;
  }

  findUserByUsername(username: string) {
    const normalized = username.trim().toLowerCase();
    return [...this.users.values()].find((user) => user.username === normalized);
  }

  requireUser(id: string) {
    const user = this.users.get(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  publicUser(user: UserRecord) {
    const { passwordHash: _, ...safe } = user;
    return { ...safe, hasAiKey: this.credentials.has(user.id) };
  }

  membershipKey(workspaceId: string, userId: string) {
    return `${workspaceId}:${userId}`;
  }

  setMembership(workspaceId: string, userId: string, role: WorkspaceRole) {
    const membership: MembershipRecord = { workspaceId, userId, role, joinedAt: new Date() };
    this.memberships.set(this.membershipKey(workspaceId, userId), membership);
    return membership;
  }

  getMembership(workspaceId: string, userId: string) {
    return this.memberships.get(this.membershipKey(workspaceId, userId));
  }

  listUserWorkspaces(userId: string) {
    return [...this.memberships.values()]
      .filter((membership) => membership.userId === userId)
      .map((membership) => ({ ...this.workspaces.get(membership.workspaceId)!, role: membership.role }))
      .filter((workspace) => workspace.id);
  }

  requireWorkspace(id: string) {
    const workspace = this.workspaces.get(id);
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  requireProject(id: string) {
    const project = this.projects.get(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
