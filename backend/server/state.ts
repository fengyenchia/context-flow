import { randomUUID } from 'node:crypto';
import { db } from '../src/db/client';
import {
  captureBaseline,
  collectionNames,
  persistChanges,
  type Baseline,
} from './persistence';
import {
  documents as documentsTable,
  emailVerificationTokens,
} from '../src/db/schema';
import {
  aiCredentials,
  canvasEdges,
  canvasMessages,
  canvasNodes,
  canvasResources,
  canvasSummaries,
  passwordResetTokens,
  projects as projectsTable,
  refreshSessions,
  users as usersTable,
  workspaceInvitations,
  workspaceMembers,
  workspaces as workspacesTable,
} from '../src/db/schema';

export const asDate = (value: Date | string | null | undefined) =>
  value == null ? null : value instanceof Date ? value : new Date(value);

export type User = {
  id: string;
  username: string;
  email?: string;
  emailVerifiedAt?: Date;
  displayName: string;
  passwordHash: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  tokenVersion: number;
  createdAt: Date;
  lastLoginAt?: Date;
};
export type Workspace = {
  id: string;
  name: string;
  kind: 'personal' | 'shared';
  createdByUserId: string;
  createdAt: Date;
};
export type Membership = {
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  joinedAt: Date;
};
export type Project = {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  name: string;
  description: string;
  layoutDirection: 'LR' | 'TB';
  createdAt: Date;
};
export type Invitation = {
  id: string;
  workspaceId: string;
  targetUserId: string;
  invitedByUserId: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Date;
};
type Session = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
};
type Credential = {
  userId: string;
  encryptedApiKey: string;
  iv: string;
  authTag: string;
  keyHint: string;
  updatedAt: Date;
  lastValidatedAt?: Date;
};
type Reset = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
};
type EmailVerification = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
};
export type CanvasSnapshot = {
  nodes: unknown[];
  edges: unknown[];
  convergenceNodes?: unknown[];
  convergenceEdges?: unknown[];
  resources?: unknown[];
  conversations?: Record<string, string[]>;
  summary?: string;
  updatedAt: Date;
};
type ResourceKind = 'text' | 'link' | 'file' | 'image';

export class MemoryState {
  users = new Map<string, User>();
  workspaces = new Map<string, Workspace>();
  memberships = new Map<string, Membership>();
  projects = new Map<string, Project>();
  invitations = new Map<string, Invitation>();
  sessions = new Map<string, Session>();
  credentials = new Map<string, Credential>();
  resets = new Map<string, Reset>();
  emailVerifications = new Map<string, EmailVerification>();
  adminAudit: Record<string, unknown>[] = [];
  canvasSnapshots = new Map<string, CanvasSnapshot>();
  documents = new Map<string, typeof documentsTable.$inferSelect>();
  private hydrated = false;

  async hydrate(force = false) {
    if (!db) {
      this.hydrated = true;
      this.ensureAdmin();
      return;
    }
    if (this.hydrated && !force) return;
    const [
      userRows,
      workspaceRows,
      memberRows,
      projectRows,
      invitationRows,
      sessionRows,
      credentialRows,
      resetRows,
      nodeRows,
      edgeRows,
      resourceRows,
      messageRows,
      summaryRows,
      verificationRows,
      documentRows,
    ] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(workspacesTable),
      db.select().from(workspaceMembers),
      db.select().from(projectsTable),
      db.select().from(workspaceInvitations),
      db.select().from(refreshSessions),
      db.select().from(aiCredentials),
      db.select().from(passwordResetTokens),
      db.select().from(canvasNodes),
      db.select().from(canvasEdges),
      db.select().from(canvasResources),
      db
        .select()
        .from(canvasMessages)
        .orderBy(
          canvasMessages.projectId,
          canvasMessages.threadKey,
          canvasMessages.sequence,
        ),
      db.select().from(canvasSummaries),
      db.select().from(emailVerificationTokens),
      db.select().from(documentsTable),
    ]);
    let createdPersonalWorkspace = false;
    {
      this.users = new Map(
        userRows.map((row) => [
          row.id,
          {
            id: row.id,
            username: row.username,
            email: row.email ?? undefined,
            emailVerifiedAt: row.emailVerifiedAt ?? undefined,
            passwordHash: row.passwordHash,
            displayName: row.displayName || row.username,
            role: row.role === 'admin' ? 'admin' : 'user',
            status: row.status === 'suspended' ? 'suspended' : 'active',
            tokenVersion: row.tokenVersion,
            createdAt: row.createdAt,
            lastLoginAt: row.lastLoginAt ?? undefined,
          },
        ]),
      );
      this.workspaces = new Map(
        workspaceRows.map((row) => [
          row.id,
          {
            id: row.id,
            name: row.name,
            kind: row.kind === 'shared' ? 'shared' : 'personal',
            createdByUserId: row.createdByUserId || '',
            createdAt: row.createdAt,
          },
        ]),
      );
      this.memberships = new Map(
        memberRows.map((row) => [
          this.memberKey(row.workspaceId, row.userId),
          {
            workspaceId: row.workspaceId,
            userId: row.userId,
            role: (['owner', 'admin', 'editor', 'viewer'].includes(row.role)
              ? row.role
              : 'viewer') as Membership['role'],
            joinedAt: row.joinedAt,
          },
        ]),
      );
      this.projects = new Map(
        projectRows.map((row) => [
          row.id,
          {
            id: row.id,
            workspaceId: row.workspaceId,
            createdByUserId: row.createdByUserId || '',
            name: row.name,
            description: row.description || '',
            layoutDirection: row.layoutDirection === 'TB' ? 'TB' : 'LR',
            createdAt: row.createdAt,
          },
        ]),
      );
      this.invitations = new Map(
        invitationRows.map((row) => [
          row.id,
          {
            id: row.id,
            workspaceId: row.workspaceId,
            targetUserId: row.targetUserId,
            invitedByUserId: row.invitedByUserId || '',
            role: (['admin', 'editor', 'viewer'].includes(row.role)
              ? row.role
              : 'viewer') as Invitation['role'],
            status: (['pending', 'accepted', 'declined'].includes(row.status)
              ? row.status
              : 'pending') as Invitation['status'],
            createdAt: row.createdAt,
          },
        ]),
      );
      this.sessions = new Map(
        sessionRows.map((row) => [
          row.id,
          {
            id: row.id,
            userId: row.userId,
            tokenHash: row.tokenHash,
            expiresAt: row.expiresAt,
            revokedAt: row.revokedAt ?? undefined,
          },
        ]),
      );
      this.credentials = new Map(
        credentialRows.map((row) => [
          row.userId,
          {
            userId: row.userId,
            encryptedApiKey: row.encryptedApiKey,
            iv: row.encryptionIv,
            authTag: row.authTag,
            keyHint: row.keyHint,
            updatedAt: row.updatedAt,
            lastValidatedAt: row.lastValidatedAt ?? undefined,
          },
        ]),
      );
      this.resets = new Map(
        resetRows.map((row) => [
          row.id,
          {
            id: row.id,
            userId: row.userId,
            tokenHash: row.tokenHash,
            expiresAt: row.expiresAt,
            consumedAt: row.consumedAt ?? undefined,
          },
        ]),
      );
      this.emailVerifications = new Map(
        verificationRows.map((row) => [
          row.id,
          { ...row, consumedAt: row.consumedAt ?? undefined },
        ]),
      );
      this.documents = new Map(documentRows.map((row) => [row.id, row]));
      this.baseline = captureBaseline(this);
      const snapshots = new Map<string, CanvasSnapshot>();
      for (const row of nodeRows) {
        const snapshot = snapshots.get(row.projectId) || {
          nodes: [],
          edges: [],
          convergenceNodes: [],
          convergenceEdges: [],
          resources: [],
          conversations: {},
          summary: '',
          updatedAt: asDate(row.updatedAt) || new Date(),
        };
        const original =
          row.groundingSource && typeof row.groundingSource === 'object'
            ? (row.groundingSource as Record<string, unknown>)
            : {};
        const node = {
          id: String(original.id || row.id),
          position: { x: row.positionX, y: row.positionY },
          data: {
            ...((original.data || {}) as Record<string, unknown>),
            nodeKind: row.mediaType,
            nodeTitle: row.title || '',
            nodeContent: row.content || '',
            imageUrl: row.mediaUrl || undefined,
          },
          style: original.style,
        };
        if (row.zone === 'converge') snapshot.convergenceNodes!.push(node);
        else snapshot.nodes.push(node);
        snapshots.set(row.projectId, snapshot);
      }
      for (const row of edgeRows) {
        const snapshot = snapshots.get(row.projectId) || {
          nodes: [],
          edges: [],
          convergenceNodes: [],
          convergenceEdges: [],
          resources: [],
          conversations: {},
          summary: '',
          updatedAt: new Date(),
        };
        const edge =
          row.payload && typeof row.payload === 'object'
            ? (row.payload as Record<string, unknown>)
            : {
                id: row.id,
                source: row.sourceId,
                target: row.targetId,
                label: row.label || undefined,
              };
        if (row.zone === 'converge') snapshot.convergenceEdges!.push(edge);
        else snapshot.edges.push(edge);
        snapshots.set(row.projectId, snapshot);
      }
      for (const row of resourceRows) {
        const snapshot = snapshots.get(row.projectId) || {
          nodes: [],
          edges: [],
          convergenceNodes: [],
          convergenceEdges: [],
          resources: [],
          conversations: {},
          summary: '',
          updatedAt: new Date(),
        };
        snapshot.resources!.push({
          id: row.resourceKey,
          kind: row.kind as ResourceKind,
          title: row.title,
          content: row.content || undefined,
          url: row.url || undefined,
          contentHash: row.contentHash || undefined,
        });
        snapshots.set(row.projectId, snapshot);
      }
      for (const row of messageRows) {
        const snapshot = snapshots.get(row.projectId) || {
          nodes: [],
          edges: [],
          convergenceNodes: [],
          convergenceEdges: [],
          resources: [],
          conversations: {},
          summary: '',
          updatedAt: new Date(),
        };
        snapshot.conversations![row.threadKey] = [
          ...(snapshot.conversations![row.threadKey] || []),
          row.content,
        ];
        snapshots.set(row.projectId, snapshot);
      }
      for (const row of summaryRows) {
        const snapshot = snapshots.get(row.projectId) || {
          nodes: [],
          edges: [],
          convergenceNodes: [],
          convergenceEdges: [],
          resources: [],
          conversations: {},
          summary: '',
          updatedAt: new Date(),
        };
        snapshot.summary = row.content;
        snapshot.updatedAt = asDate(row.updatedAt) || snapshot.updatedAt;
        snapshots.set(row.projectId, snapshot);
      }
      this.canvasSnapshots = snapshots;
      this.baseline = captureBaseline(this);
      // Existing databases may predate the personal-workspace bootstrap. Ensure
      // every user has a private workspace without changing shared workspaces.
      for (const user of this.users.values()) {
        const hasPersonal = [...this.workspaces.values()].some(
          (workspace) =>
            workspace.kind === 'personal' &&
            workspace.createdByUserId === user.id,
        );
        if (!hasPersonal) {
          const workspace: Workspace = {
            id: randomUUID(),
            name: `${user.displayName} 的工作區`,
            kind: 'personal',
            createdByUserId: user.id,
            createdAt: new Date(),
          };
          this.workspaces.set(workspace.id, workspace);
          this.memberships.set(this.memberKey(workspace.id, user.id), {
            workspaceId: workspace.id,
            userId: user.id,
            role: 'owner',
            joinedAt: new Date(),
          });
          createdPersonalWorkspace = true;
        }
      }
    }
    this.hydrated = true;
    // Bootstrap changes are committed with the enclosing successful request.
    if (!createdPersonalWorkspace) this.baseline = captureBaseline(this);
    this.ensureAdmin();
  }

  private ensureAdmin() {
    if (
      this.users.size === 0 &&
      process.env.INITIAL_ADMIN_USERNAME &&
      process.env.INITIAL_ADMIN_PASSWORD_HASH
    ) {
      const user = this.createUser({
        username: process.env.INITIAL_ADMIN_USERNAME,
        displayName: '系統管理員',
        passwordHash: process.env.INITIAL_ADMIN_PASSWORD_HASH,
        role: 'admin',
      });
      user.emailVerifiedAt = new Date();
    }
  }

  async persist() {
    await persistChanges(this, this.baseline);
    this.baseline = captureBaseline(this);
  }

  private baseline: Baseline = captureBaseline(this);
  private requestQueue: Promise<unknown> = Promise.resolve();

  async runRequest<T>(action: () => Promise<T>) {
    const run = this.requestQueue.then(async () => {
      await this.hydrate(Boolean(db));
      const before = new Map(
        collectionNames.map((name) => [name, structuredClone(this[name])]),
      );
      try {
        return await action();
      } catch (error) {
        for (const name of collectionNames) {
          const target = this[name] as Map<string, unknown>;
          target.clear();
          for (const [id, value] of before.get(name)!) target.set(id, value);
        }
        throw error;
      }
    });
    this.requestQueue = run.catch(() => undefined);
    return run;
  }

  publicUser(user: User) {
    const { passwordHash: _, ...safe } = user;
    return { ...safe, hasAiKey: this.credentials.has(user.id) };
  }
  findUser(username: string) {
    return [...this.users.values()].find(
      (user) => user.username === username.trim().toLowerCase(),
    );
  }
  findUserByEmail(email: string) {
    return [...this.users.values()].find(
      (user) => user.email === email.trim().toLowerCase(),
    );
  }
  user(id: string) {
    const value = this.users.get(id);
    if (!value) throw new ApiProblem(404, '找不到使用者');
    return value;
  }
  workspace(id: string) {
    const value = this.workspaces.get(id);
    if (!value) throw new ApiProblem(404, '找不到工作區');
    return value;
  }
  project(id: string) {
    const value = this.projects.get(id);
    if (!value) throw new ApiProblem(404, '找不到專案');
    return value;
  }
  memberKey(workspaceId: string, userId: string) {
    return `${workspaceId}:${userId}`;
  }
  member(workspaceId: string, userId: string) {
    return this.memberships.get(this.memberKey(workspaceId, userId));
  }
  requireRole(
    workspaceId: string,
    userId: string,
    roles: Membership['role'][],
  ) {
    this.workspace(workspaceId);
    const membership = this.member(workspaceId, userId);
    if (!membership || !roles.includes(membership.role))
      throw new ApiProblem(403, '沒有此工作區權限');
    return membership;
  }
  createUser(input: {
    username: string;
    email?: string;
    displayName: string;
    passwordHash: string;
    role?: User['role'];
  }) {
    const username = input.username.trim().toLowerCase();
    if (this.findUser(username)) throw new ApiProblem(409, '帳號名稱已被使用');
    const user: User = {
      id: randomUUID(),
      username,
      email: input.email?.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      passwordHash: input.passwordHash,
      role: input.role ?? 'user',
      status: 'active',
      tokenVersion: 1,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    const workspace: Workspace = {
      id: randomUUID(),
      name: `${user.displayName} 的工作區`,
      kind: 'personal',
      createdByUserId: user.id,
      createdAt: new Date(),
    };
    this.workspaces.set(workspace.id, workspace);
    this.memberships.set(this.memberKey(workspace.id, user.id), {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'owner',
      joinedAt: new Date(),
    });
    return user;
  }
}

export class ApiProblem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const globalState = globalThis as typeof globalThis & {
  contextFlowState?: MemoryState;
};
export const state =
  globalState.contextFlowState instanceof MemoryState
    ? globalState.contextFlowState
    : (globalState.contextFlowState = new MemoryState());

// Next dev hot reload can preserve an older global state instance. Keep newly
// added collections available without forcing users to lose in-memory data.
if (
  !(
    state as MemoryState & {
      emailVerifications?: Map<string, EmailVerification>;
    }
  ).emailVerifications
) {
  (
    state as MemoryState & {
      emailVerifications: Map<string, EmailVerification>;
    }
  ).emailVerifications = new Map();
}
