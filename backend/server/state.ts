import { randomUUID } from 'node:crypto';
import { db } from '../src/db/client';
import { appState, aiCredentials, canvasNodes, passwordResetTokens, projects as projectsTable, refreshSessions, users as usersTable, workspaceInvitations, workspaceMembers, workspaces as workspacesTable } from '../src/db/schema';
import { eq } from 'drizzle-orm';

const asDate = (value: Date | string | null | undefined) => value == null ? null : value instanceof Date ? value : new Date(value);

export type User = { id: string; username: string; email?: string; emailVerifiedAt?: Date; displayName: string; passwordHash: string; role: 'user' | 'admin'; status: 'active' | 'suspended'; tokenVersion: number; createdAt: Date; lastLoginAt?: Date };
export type Workspace = { id: string; name: string; kind: 'personal' | 'shared'; createdByUserId: string; createdAt: Date };
export type Membership = { workspaceId: string; userId: string; role: 'owner' | 'admin' | 'editor' | 'viewer'; joinedAt: Date };
export type Project = { id: string; workspaceId: string; createdByUserId: string; name: string; description: string; layoutDirection: 'LR' | 'TB'; createdAt: Date };
export type Invitation = { id: string; workspaceId: string; targetUserId: string; invitedByUserId: string; role: 'admin' | 'editor' | 'viewer'; status: 'pending' | 'accepted' | 'declined'; createdAt: Date };
type Session = { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt?: Date };
type Credential = { userId: string; encryptedApiKey: string; iv: string; authTag: string; keyHint: string; updatedAt: Date; lastValidatedAt?: Date };
type Reset = { id: string; userId: string; tokenHash: string; expiresAt: Date; consumedAt?: Date };
type EmailVerification = { id: string; userId: string; tokenHash: string; expiresAt: Date; consumedAt?: Date };
export type CanvasSnapshot = { nodes: unknown[]; edges: unknown[]; convergenceNodes?: unknown[]; convergenceEdges?: unknown[]; resources?: unknown[]; conversations?: Record<string, string[]>; summary?: string; updatedAt: Date };

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
  canvasSnapshots = new Map<string, CanvasSnapshot>();
  private hydrated = false;

  async hydrate() {
    if (this.hydrated || !db) { this.hydrated = true; return; }
    const [userRows, workspaceRows, memberRows, projectRows, invitationRows, sessionRows, credentialRows, resetRows] = await Promise.all([
      db.select().from(usersTable), db.select().from(workspacesTable), db.select().from(workspaceMembers), db.select().from(projectsTable),
      db.select().from(workspaceInvitations), db.select().from(refreshSessions), db.select().from(aiCredentials), db.select().from(passwordResetTokens),
    ]);
    if (userRows.length || workspaceRows.length || projectRows.length) {
      this.users = new Map(userRows.map((row) => [row.id, { id: row.id, username: row.username, email: row.email ?? undefined, emailVerifiedAt: row.emailVerifiedAt ?? undefined, passwordHash: row.passwordHash, displayName: row.displayName || row.username, role: row.role === 'admin' ? 'admin' : 'user', status: row.status === 'suspended' ? 'suspended' : 'active', tokenVersion: row.tokenVersion, createdAt: row.createdAt, lastLoginAt: row.lastLoginAt ?? undefined }]));
      this.workspaces = new Map(workspaceRows.map((row) => [row.id, { id: row.id, name: row.name, kind: row.kind === 'shared' ? 'shared' : 'personal', createdByUserId: row.createdByUserId || '', createdAt: row.createdAt }]));
      this.memberships = new Map(memberRows.map((row) => [this.memberKey(row.workspaceId, row.userId), { workspaceId: row.workspaceId, userId: row.userId, role: (['owner', 'admin', 'editor', 'viewer'].includes(row.role) ? row.role : 'viewer') as Membership['role'], joinedAt: row.joinedAt }]));
      this.projects = new Map(projectRows.map((row) => [row.id, { id: row.id, workspaceId: row.workspaceId, createdByUserId: row.createdByUserId || '', name: row.name, description: row.description || '', layoutDirection: row.layoutDirection === 'TB' ? 'TB' : 'LR', createdAt: row.createdAt }]));
      this.invitations = new Map(invitationRows.map((row) => [row.id, { id: row.id, workspaceId: row.workspaceId, targetUserId: row.targetUserId, invitedByUserId: row.invitedByUserId || '', role: (['admin', 'editor', 'viewer'].includes(row.role) ? row.role : 'viewer') as Invitation['role'], status: (['pending', 'accepted', 'declined'].includes(row.status) ? row.status : 'pending') as Invitation['status'], createdAt: row.createdAt }]));
      this.sessions = new Map(sessionRows.map((row) => [row.id, { id: row.id, userId: row.userId, tokenHash: row.tokenHash, expiresAt: row.expiresAt, revokedAt: row.revokedAt ?? undefined }]));
      this.credentials = new Map(credentialRows.map((row) => [row.userId, { userId: row.userId, encryptedApiKey: row.encryptedApiKey, iv: row.encryptionIv, authTag: row.authTag, keyHint: row.keyHint, updatedAt: row.updatedAt, lastValidatedAt: row.lastValidatedAt ?? undefined }]));
      this.resets = new Map(resetRows.map((row) => [row.id, { id: row.id, userId: row.userId, tokenHash: row.tokenHash, expiresAt: row.expiresAt, consumedAt: row.consumedAt ?? undefined }]));
    }
    const rows = await db.select().from(appState).where(eq(appState.id, 'global')).limit(1);
    const payload = rows[0]?.payload;
    if (payload && typeof payload === 'object') {
      const value = payload as Record<string, unknown>;
      const restoreMap = <T>(key: string, revive?: (item: T) => T) => {
        const entries = Array.isArray(value[key]) ? value[key] as Array<[string, T]> : [];
        return new Map(entries.map(([id, item]) => [id, revive ? revive(item) : item] as [string, T]));
      };
      const date = <T extends Record<string, unknown>>(item: T, fields: string[]) => { for (const field of fields) if (typeof item[field] === 'string') (item as Record<string, unknown>)[field] = new Date(item[field] as string); return item; };
      if (!userRows.length && !workspaceRows.length && !projectRows.length) {
        this.users = restoreMap<User>('users', (item) => date(item, ['createdAt', 'lastLoginAt']));
        this.workspaces = restoreMap<Workspace>('workspaces', (item) => date(item, ['createdAt']));
        this.memberships = restoreMap<Membership>('memberships', (item) => date(item, ['joinedAt']));
        this.projects = restoreMap<Project>('projects', (item) => date(item, ['createdAt']));
        this.invitations = restoreMap<Invitation>('invitations', (item) => date(item, ['createdAt']));
        this.sessions = restoreMap<Session>('sessions', (item) => date(item, ['expiresAt', 'revokedAt']));
        this.credentials = restoreMap<Credential>('credentials', (item) => date(item, ['updatedAt', 'lastValidatedAt']));
        this.resets = restoreMap<Reset>('resets', (item) => date(item, ['expiresAt', 'consumedAt']));
        this.emailVerifications = restoreMap<EmailVerification>('emailVerifications', (item) => date(item, ['expiresAt', 'consumedAt']));
      }
      this.canvasSnapshots = restoreMap<CanvasSnapshot>('canvasSnapshots', (item) => date(item, ['updatedAt']));
      this.adminAudit = Array.isArray(value.adminAudit) ? value.adminAudit as Record<string, unknown>[] : [];
    }
    this.hydrated = true;
  }

  async persist() {
    if (!db) return;
    // Keep the normalized tables authoritative for new writes. The aggregate
    // row remains as a backwards-compatible recovery copy while old clients
    // are migrated away from app_state.
    try {
      await db.delete(canvasNodes);
    await db.delete(workspaceInvitations);
    await db.delete(workspaceMembers);
    await db.delete(projectsTable);
    await db.delete(workspacesTable);
    await db.delete(passwordResetTokens);
    await db.delete(refreshSessions);
    await db.delete(aiCredentials);
    await db.delete(usersTable);
    if (this.users.size) await db.insert(usersTable).values([...this.users.values()].map((user) => ({ id: user.id, username: user.username, email: user.email ?? null, emailVerifiedAt: asDate(user.emailVerifiedAt), passwordHash: user.passwordHash, displayName: user.displayName, role: user.role, status: user.status, tokenVersion: user.tokenVersion, lastLoginAt: asDate(user.lastLoginAt), createdAt: asDate(user.createdAt)!, updatedAt: asDate(user.createdAt)! })));
    if (this.workspaces.size) await db.insert(workspacesTable).values([...this.workspaces.values()].map((workspace) => ({ id: workspace.id, name: workspace.name, kind: workspace.kind, createdByUserId: workspace.createdByUserId, createdAt: asDate(workspace.createdAt)!, updatedAt: asDate(workspace.createdAt)! })));
    if (this.memberships.size) await db.insert(workspaceMembers).values([...this.memberships.values()].map((membership) => ({ workspaceId: membership.workspaceId, userId: membership.userId, role: membership.role, joinedAt: asDate(membership.joinedAt)! })));
    if (this.projects.size) await db.insert(projectsTable).values([...this.projects.values()].map((project) => ({ id: project.id, workspaceId: project.workspaceId, createdByUserId: project.createdByUserId, name: project.name, description: project.description, layoutDirection: project.layoutDirection, createdAt: asDate(project.createdAt)!, updatedAt: asDate(project.createdAt)! })));
    if (this.invitations.size) await db.insert(workspaceInvitations).values([...this.invitations.values()].map((invitation) => ({ id: invitation.id, workspaceId: invitation.workspaceId, targetUserId: invitation.targetUserId, invitedByUserId: invitation.invitedByUserId, role: invitation.role, status: invitation.status, createdAt: asDate(invitation.createdAt)!, respondedAt: invitation.status === 'pending' ? null : asDate(invitation.createdAt) })));
    if (this.sessions.size) await db.insert(refreshSessions).values([...this.sessions.values()].map((session) => ({ id: session.id, userId: session.userId, tokenHash: session.tokenHash, expiresAt: asDate(session.expiresAt)!, revokedAt: asDate(session.revokedAt), createdAt: new Date() })));
    if (this.resets.size) await db.insert(passwordResetTokens).values([...this.resets.values()].map((reset) => ({ id: reset.id, userId: reset.userId, tokenHash: reset.tokenHash, expiresAt: asDate(reset.expiresAt)!, consumedAt: asDate(reset.consumedAt), createdAt: new Date() })));
    if (this.credentials.size) await db.insert(aiCredentials).values([...this.credentials.values()].map((credential) => ({ userId: credential.userId, provider: 'gemini', encryptedApiKey: credential.encryptedApiKey, encryptionIv: credential.iv, authTag: credential.authTag, keyHint: credential.keyHint, lastValidatedAt: asDate(credential.lastValidatedAt), createdAt: asDate(credential.updatedAt)!, updatedAt: asDate(credential.updatedAt)! })));
    for (const [projectId, snapshot] of this.canvasSnapshots) {
      const rows = [...(snapshot.nodes || []).map((node) => ({ node, zone: 'zone' })), ...(snapshot.convergenceNodes || []).map((node) => ({ node, zone: 'converge' }))];
      const values = rows.map(({ node, zone }) => { const item = node as Record<string, unknown>; const data = (item.data || {}) as Record<string, unknown>; const rawId = String(item.id || ''); const id = /^[0-9a-f-]{36}$/i.test(rawId) ? rawId : randomUUID(); const position = (item.position || {}) as Record<string, unknown>; return { id, projectId, zone, mediaType: String(data.nodeKind || 'text'), title: data.nodeTitle ? String(data.nodeTitle) : null, content: data.nodeContent ? String(data.nodeContent) : null, mediaUrl: data.imageUrl ? String(data.imageUrl) : null, positionX: Number(position.x) || 0, positionY: Number(position.y) || 0, groundingSource: null }; });
      if (values.length) await db.insert(canvasNodes).values(values);
    }
    } catch (error) {
      // A normalized-table failure must not turn an otherwise valid API
      // response into a 500. The aggregate backup below remains available and
      // logs the exact database error for follow-up.
      console.error('Normalized persistence failed', error);
    }
    const payload = {
      users: [...this.users.entries()], workspaces: [...this.workspaces.entries()], memberships: [...this.memberships.entries()], projects: [...this.projects.entries()], invitations: [...this.invitations.entries()], sessions: [...this.sessions.entries()], credentials: [...this.credentials.entries()], resets: [...this.resets.entries()], emailVerifications: [...this.emailVerifications.entries()], canvasSnapshots: [...this.canvasSnapshots.entries()], adminAudit: this.adminAudit,
    };
    await db.insert(appState).values({ id: 'global', payload, updatedAt: new Date() }).onConflictDoUpdate({ target: appState.id, set: { payload, updatedAt: new Date() } });
  }

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
