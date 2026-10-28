import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ApiProblem, state, type ProjectInviteLink } from './state';
import { projectInvitesEnabled } from './project-invite-config';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
function enabled() { if (!projectInvitesEnabled()) throw new ApiProblem(503, '專案邀請連結尚未啟用'); }
function manager(projectId: string, userId: string) {
  enabled();
  const project = state.project(projectId);
  state.requireRole(project.workspaceId, userId, ['owner', 'admin']);
}
function publicLink(link: ProjectInviteLink) {
  return { id: link.id, role: link.role, expiresAt: link.expiresAt, revokedAt: link.revokedAt || null, createdAt: link.createdAt,
    joinedCount: [...state.projectGrants.values()].filter(grant => grant.linkId === link.id).length };
}
function findLink(token: unknown) {
  enabled();
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiProblem(410, '邀請連結無效、已到期或已撤銷');
  const link = [...state.projectLinks.values()].find(item => item.tokenHash === hash(token));
  if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now() || !state.projects.has(link.projectId)) throw new ApiProblem(410, '邀請連結無效、已到期或已撤銷');
  return link;
}
export function listProjectLinks(projectId: string, userId: string) {
  manager(projectId, userId);
  return [...state.projectLinks.values()].filter(link => link.projectId === projectId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(publicLink);
}
export function createProjectLink(projectId: string, userId: string, input: Record<string, unknown>) {
  manager(projectId, userId);
  if (input.role !== 'editor' && input.role !== 'viewer') throw new ApiProblem(400, '請選擇編輯或檢視權限');
  const expiry = typeof input.expiresAt === 'string' ? Date.parse(input.expiresAt) : NaN;
  const duration = expiry - Date.now();
  if (!Number.isFinite(duration) || duration < 5 * 60_000 || duration > 366 * 86400_000) throw new ApiProblem(400, '期限須介於 5 分鐘到 1 年之間');
  if ([...state.projectLinks.values()].filter(link => link.projectId === projectId && !link.revokedAt).length >= 20) throw new ApiProblem(400, '請先撤銷不再使用的連結，每個專案最多保留 20 條');
  const token = randomBytes(32).toString('base64url');
  const link: ProjectInviteLink = { id: randomUUID(), projectId, tokenHash: hash(token), role: input.role, expiresAt: new Date(expiry), createdByUserId: userId, createdAt: new Date() };
  const url = new URL('/project-invite', process.env.PUBLIC_APP_URL || 'http://localhost:3000');
  url.hash = token;
  state.projectLinks.set(link.id, link);
  return { ...publicLink(link), url: url.toString() };
}
export function updateProjectLink(projectId: string, id: string, userId: string, role?: unknown) {
  manager(projectId, userId);
  const link = state.projectLinks.get(id);
  if (!link || link.projectId !== projectId) throw new ApiProblem(404, '找不到邀請連結');
  if (role === undefined) link.revokedAt = link.revokedAt || new Date();
  else {
    if (link.revokedAt) throw new ApiProblem(410, '此連結已撤銷');
    if (role !== 'editor' && role !== 'viewer') throw new ApiProblem(400, '權限無效');
    link.role = role;
  }
  return publicLink(link);
}
export function previewProjectLink(token: unknown) {
  const link = findLink(token);
  return { name: state.project(link.projectId).name, role: link.role, expiresAt: link.expiresAt };
}
export function acceptProjectLink(token: unknown, userId: string) {
  const link = findLink(token);
  if (![...state.projectGrants.values()].some(grant => grant.linkId === link.id && grant.userId === userId)) {
    const id = randomUUID(); state.projectGrants.set(id, { id, linkId: link.id, userId, joinedAt: new Date() });
  }
  const project = state.project(link.projectId);
  return { id: project.id, workspaceId: project.workspaceId, name: project.name, role: state.projectRole(project.id, userId) };
}
