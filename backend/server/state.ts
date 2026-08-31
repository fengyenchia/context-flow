import { randomUUID } from 'node:crypto';

export type User = { id: string; username: string; email?: string; emailVerifiedAt?: Date; displayName: string; passwordHash: string; role: 'user' | 'admin'; status: 'active' | 'suspended'; tokenVersion: number; createdAt: Date; lastLoginAt?: Date };
export type Workspace = { id: string; name: string; kind: 'personal' | 'shared'; createdByUserId: string; createdAt: Date };
export type Membership = { workspaceId: string; userId: string; role: 'owner' | 'admin' | 'editor' | 'viewer'; joinedAt: Date };
export type Project = { id: string; workspaceId: string; createdByUserId: string; name: string; description: string; layoutDirection: 'LR' | 'TB'; createdAt: Date };
export type Invitation = { id: string; workspaceId: string; targetUserId: string; invitedByUserId: string; role: 'admin' | 'editor' | 'viewer'; status: 'pending' | 'accepted' | 'declined'; createdAt: Date };
type Session = { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt?: Date };
type Credential = { userId: string; encryptedApiKey: string; iv: string; authTag: string; keyHint: string; updatedAt: Date; lastValidatedAt?: Date };
type Reset = { id: string; userId: string; tokenHash: string; expiresAt: Date; consumedAt?: Date };
type EmailVerification = { id: string; userId: string; tokenHash: string; expiresAt: Date; consumedAt?: Date };

class MemoryState {
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

  publicUser(user: User) { const { passwordHash: _, ...safe } = user; return { ...safe, hasAiKey: this.credentials.has(user.id) }; }
  findUser(username: string) { return [...this.users.values()].find((user) => user.username === username.trim().toLowerCase()); }
  findUserByEmail(email: string) { return [...this.users.values()].find((user) => user.email === email.trim().toLowerCase()); }
  user(id: string) { const value = this.users.get(id); if (!value) throw new ApiProblem(404, '找不到使用者'); return value; }
  workspace(id: string) { const value = this.workspaces.get(id); if (!value) throw new ApiProblem(404, '找不到工作區'); return value; }
  project(id: string) { const value = this.projects.get(id); if (!value) throw new ApiProblem(404, '找不到專案'); return value; }
  memberKey(workspaceId: string, userId: string) { return `${workspaceId}:${userId}`; }
  member(workspaceId: string, userId: string) { return this.memberships.get(this.memberKey(workspaceId, userId)); }
  requireRole(workspaceId: string, userId: string, roles: Membership['role'][]) { this.workspace(workspaceId); const membership = this.member(workspaceId, userId); if (!membership || !roles.includes(membership.role)) throw new ApiProblem(403, '沒有此工作區權限'); return membership; }
  createUser(input: { username: string; email?: string; displayName: string; passwordHash: string; role?: User['role'] }) {
    const username = input.username.trim().toLowerCase();
    if (this.findUser(username)) throw new ApiProblem(409, '帳號名稱已被使用');
    const user: User = { id: randomUUID(), username, email: input.email?.trim().toLowerCase(), displayName: input.displayName.trim(), passwordHash: input.passwordHash, role: input.role ?? 'user', status: 'active', tokenVersion: 1, createdAt: new Date() };
    this.users.set(user.id, user);
    const workspace: Workspace = { id: randomUUID(), name: `${user.displayName} 的工作區`, kind: 'personal', createdByUserId: user.id, createdAt: new Date() };
    this.workspaces.set(workspace.id, workspace);
    this.memberships.set(this.memberKey(workspace.id, user.id), { workspaceId: workspace.id, userId: user.id, role: 'owner', joinedAt: new Date() });
    return user;
  }
}

export class ApiProblem extends Error { constructor(public status: number, message: string) { super(message); } }

const globalState = globalThis as typeof globalThis & { contextFlowState?: MemoryState };
export const state = globalState.contextFlowState ??= new MemoryState();

// Next dev hot reload can preserve an older global state instance. Keep newly
// added collections available without forcing users to lose in-memory data.
if (!(state as MemoryState & { emailVerifications?: Map<string, EmailVerification> }).emailVerifications) {
  (state as MemoryState & { emailVerifications: Map<string, EmailVerification> }).emailVerifications = new Map();
}

if (state.users.size === 0 && process.env.INITIAL_ADMIN_USERNAME && process.env.INITIAL_ADMIN_PASSWORD_HASH) {
  state.createUser({ username: process.env.INITIAL_ADMIN_USERNAME, displayName: '系統管理員', passwordHash: process.env.INITIAL_ADMIN_PASSWORD_HASH, role: 'admin' });
}
