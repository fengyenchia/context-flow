import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Y } from '@context-flow/collaboration';
import { GET, POST, PUT, PATCH, DELETE } from '../app/api/[...path]/route';
import { state } from './state';
import { createSession } from './auth';
import { collectionNames } from './persistence';

const { rooms, signed } = vi.hoisted(() => ({ rooms: new Map<string, { doc: Uint8Array; usersAccesses: Record<string, string[]> }>(), signed: vi.fn(async () => 'https://files.example.test/signed') }));
vi.mock('@liveblocks/node', () => ({ Liveblocks: class {
  async getRoom(id: string) { const room = rooms.get(id); if (!room) throw { status: 404 }; return room; }
  async createRoom(id: string) { rooms.set(id, { doc: new Uint8Array([0, 0]), usersAccesses: {} }); }
  async updateRoom(id: string, input: { usersAccesses: Record<string, string[] | null> }) {
    for (const [user, role] of Object.entries(input.usersAccesses)) { if (role) rooms.get(id)!.usersAccesses[user] = role; else delete rooms.get(id)!.usersAccesses[user]; }
  }
  async getYjsDocumentAsBinaryUpdate(id: string) { return rooms.get(id)!.doc; }
  async sendYjsBinaryUpdate(id: string, update: Uint8Array) { const doc = new Y.Doc(); Y.applyUpdate(doc, rooms.get(id)!.doc); Y.applyUpdate(doc, update); rooms.get(id)!.doc = Y.encodeStateAsUpdate(doc); doc.destroy(); }
  async identifyUser() { return { status: 200, body: JSON.stringify({ token: 'fixture-token' }) }; }
  async deleteRoom(id: string) { rooms.delete(id); }
} }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: signed }));
vi.mock('@aws-sdk/client-s3', async original => ({ ...await original<typeof import('@aws-sdk/client-s3')>(), S3Client: class { async send() { return { ContentLength: 4 }; } } }));

async function call(method: string, path: string, token?: string, body?: unknown) {
  const req = new NextRequest(`http://localhost/api/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return ({ GET, POST, PUT, PATCH, DELETE }[method]!)(req, { params: Promise.resolve({ path: path.split('/') }) });
}
async function account(name: string) {
  const user = state.createUser({ username: name, displayName: name, passwordHash: 'unused' }); user.emailVerifiedAt = new Date();
  return { user, token: (await createSession(user)).accessToken };
}
async function fixture() {
  const owner = await account('owner'), guest = await account('guest'), other = await account('other');
  const workspace = [...state.workspaces.values()].find(ws => ws.createdByUserId === owner.user.id)!;
  const project = await (await call('POST', `workspaces/${workspace.id}/projects`, owner.token, { name: '可分享專案' })).json();
  const sibling = await (await call('POST', `workspaces/${workspace.id}/projects`, owner.token, { name: '其他私人專案' })).json();
  const link = async (role = 'editor') => {
    const response = await call('POST', `projects/${project.id}/invite-links`, owner.token, { role, expiresAt: new Date(Date.now() + 600_000).toISOString() });
    expect(response.status).toBe(201); const result = await response.json();
    return { ...result, token: new URL(result.url).hash.slice(1) };
  };
  return { owner, guest, other, workspace, project, sibling, link, room: `contextflow:project:${project.id}` };
}
beforeEach(() => {
  for (const name of collectionNames) state[name].clear(); rooms.clear(); signed.mockClear();
  for (const [key, value] of Object.entries({ PROJECT_INVITES_ENABLED: 'true', COLLABORATION_ENABLED: 'true', LIVEBLOCKS_SECRET_KEY: 'sk_test_fixture', R2_ACCOUNT_ID: 'fixture', R2_BUCKET_NAME: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture' })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('single-project invitation API', () => {
  it('stores only a hash and requires authenticated explicit acceptance without adding workspace membership', async () => {
    const f = await fixture(); const link = await f.link('viewer');
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify([...state.projectLinks.values()])).not.toContain(link.token);
    expect((await call('POST', 'project-invitations/preview', undefined, { token: link.token })).status).toBe(401);
    expect((await call('POST', 'project-invitations/preview', f.guest.token, { token: link.token })).status).toBe(200);
    expect((await call('GET', `projects/${f.project.id}`, f.guest.token)).status).toBe(403);
    for (let i = 0; i < 2; i++) expect((await call('POST', 'project-invitations/accept', f.guest.token, { token: link.token })).status).toBe(200);
    expect(state.projectGrants.size).toBe(1);
    expect(state.member(f.workspace.id, f.guest.user.id)).toBeUndefined();
    const list = await (await call('GET', 'shared-projects', f.guest.token)).json();
    expect(list.map((project: { id: string }) => project.id)).toEqual([f.project.id]);
    const links = await (await call('GET', `projects/${f.project.id}/invite-links`, f.owner.token)).json();
    expect(links[0]).toMatchObject({ joinedCount: 1, role: 'viewer' });
    expect(JSON.stringify(links)).not.toContain(link.token); expect(JSON.stringify(links)).not.toContain('tokenHash');
  });
  it('restricts guests to the target project and blocks workspace, sibling, management and backup access', async () => {
    const f = await fixture(); const link = await f.link();
    await call('POST', 'project-invitations/accept', f.guest.token, { token: link.token });
    for (const path of [`workspaces/${f.workspace.id}/members`, `workspaces/${f.workspace.id}/projects`, `projects/${f.sibling.id}`, `projects/${f.sibling.id}/canvas`, `projects/${f.project.id}/backups`, `projects/${f.project.id}/invite-links`]) expect((await call('GET', path, f.guest.token)).status).toBe(403);
    expect((await call('POST', `workspaces/${f.workspace.id}/projects`, f.guest.token, { name: '越權' })).status).toBe(403);
    expect((await call('PATCH', `projects/${f.project.id}`, f.guest.token, { name: '越權' })).status).toBe(403);
    expect((await call('DELETE', `projects/${f.project.id}`, f.guest.token)).status).toBe(403);
    expect((await call('POST', `projects/${f.sibling.id}/collaboration/auth`, f.guest.token)).status).toBe(403);
    expect((await call('POST', `projects/${f.sibling.id}/data-zone/structure`, f.guest.token, {})).status).toBe(403);
    expect((await call('POST', 'ai/chat', f.guest.token, { projectId: f.sibling.id, prompt: 'test' })).status).toBe(403);
    const workspaces = await (await call('GET', 'workspaces', f.guest.token)).json();
    expect(workspaces.some((ws: { id: string }) => ws.id === f.workspace.id)).toBe(false);
  });
  it('grants editor/read-only room roles and revokes the active room when a link is revoked', async () => {
    const f = await fixture(); const link = await f.link();
    await call('POST', 'project-invitations/accept', f.guest.token, { token: link.token });
    expect((await call('POST', `projects/${f.project.id}/collaboration/auth`, f.guest.token)).status).toBe(200);
    expect(rooms.get(f.room)!.usersAccesses[f.guest.user.id]).toEqual(['room:write']);
    expect((await call('PATCH', `projects/${f.project.id}/invite-links/${link.id}`, f.owner.token, { role: 'viewer' })).status).toBe(200);
    expect(rooms.get(f.room)!.usersAccesses[f.guest.user.id]).toEqual(['room:read', 'room:presence:write']);
    expect((await call('PUT', `projects/${f.project.id}/canvas`, f.guest.token, { nodes: [], edges: [] })).status).toBe(403);
    expect((await call('DELETE', `projects/${f.project.id}/invite-links/${link.id}`, f.owner.token)).status).toBe(200);
    expect(rooms.get(f.room)!.usersAccesses[f.guest.user.id]).toBeUndefined();
    for (const path of [`projects/${f.project.id}`, `projects/${f.project.id}/canvas`]) expect((await call('GET', path, f.guest.token)).status).toBe(403);
    expect((await call('POST', `projects/${f.project.id}/collaboration/auth`, f.guest.token)).status).toBe(403);
    expect((await call('POST', 'project-invitations/accept', f.other.token, { token: link.token })).status).toBe(410);
  });
  it('expires redemption while preserving accepted grants until revocation', async () => {
    const f = await fixture(); const link = await f.link();
    await call('POST', 'project-invitations/accept', f.guest.token, { token: link.token });
    state.projectLinks.get(link.id)!.expiresAt = new Date(Date.now() - 1);
    expect((await call('POST', 'project-invitations/accept', f.other.token, { token: link.token })).status).toBe(410);
    expect((await call('POST', 'project-invitations/preview', f.other.token, { token: link.token })).status).toBe(410);
    expect((await call('GET', `projects/${f.project.id}`, f.guest.token)).status).toBe(200);
    expect((await call('POST', `projects/${f.project.id}/collaboration/auth`, f.guest.token)).status).toBe(200);
    await call('DELETE', `projects/${f.project.id}/invite-links/${link.id}`, f.owner.token);
    expect((await call('GET', `projects/${f.project.id}`, f.guest.token)).status).toBe(403);
  });
  it('keeps the union of other links and existing workspace permissions on revocation', async () => {
    const f = await fixture(); const edit = await f.link(), view = await f.link('viewer');
    for (const link of [edit, view]) await call('POST', 'project-invitations/accept', f.guest.token, { token: link.token });
    await call('POST', `projects/${f.project.id}/collaboration/auth`, f.guest.token);
    await call('DELETE', `projects/${f.project.id}/invite-links/${edit.id}`, f.owner.token);
    expect(rooms.get(f.room)!.usersAccesses[f.guest.user.id]).toEqual(['room:read', 'room:presence:write']);
    state.memberships.set(state.memberKey(f.workspace.id, f.guest.user.id), { workspaceId: f.workspace.id, userId: f.guest.user.id, role: 'editor', joinedAt: new Date() });
    await call('DELETE', `projects/${f.project.id}/invite-links/${view.id}`, f.owner.token);
    expect(rooms.get(f.room)!.usersAccesses[f.guest.user.id]).toEqual(['room:write']);
  });
  it('checks upload, completion and download against project access on every request', async () => {
    const f = await fixture(); const edit = await f.link();
    await call('POST', 'project-invitations/accept', f.guest.token, { token: edit.token });
    const upload = await (await call('POST', `projects/${f.project.id}/files/upload`, f.guest.token, { name: 'test.txt', size: 4 })).json();
    expect((await call('POST', `files/${upload.id}/complete`, f.guest.token)).status).toBe(200);
    expect((await call('GET', `files/${upload.id}/download`, f.guest.token)).status).toBe(200);
    expect((await call('GET', `files/${upload.id}/download`, f.other.token)).status).toBe(403);
    await call('PATCH', `projects/${f.project.id}/invite-links/${edit.id}`, f.owner.token, { role: 'viewer' });
    expect((await call('POST', `projects/${f.project.id}/files/upload`, f.guest.token, { name: 'denied', size: 4 })).status).toBe(403);
    expect((await call('POST', `files/${upload.id}/complete`, f.guest.token)).status).toBe(403);
    expect((await call('GET', `files/${upload.id}/download`, f.guest.token)).status).toBe(200);
    await call('DELETE', `projects/${f.project.id}/invite-links/${edit.id}`, f.owner.token);
    expect((await call('GET', `files/${upload.id}/download`, f.guest.token)).status).toBe(403);
  });
  it('supports legacy canvas saves for guest editors and rejects viewer writes', async () => {
    vi.stubEnv('COLLABORATION_ENABLED', 'false');
    const f = await fixture(); const link = await f.link();
    await call('POST', 'project-invitations/accept', f.guest.token, { token: link.token });
    expect((await call('PUT', `projects/${f.project.id}/canvas`, f.guest.token, { nodes: [], edges: [], baseUpdatedAt: null })).status).toBe(200);
    await call('PATCH', `projects/${f.project.id}/invite-links/${link.id}`, f.owner.token, { role: 'viewer' });
    expect((await call('PUT', `projects/${f.project.id}/canvas`, f.guest.token, { nodes: [], edges: [] })).status).toBe(403);
  });
  it('fails closed on invalid input, disabled feature, suspension and failed database commits', async () => {
    const f = await fixture();
    expect((await call('POST', `projects/${f.project.id}/invite-links`, f.owner.token, { role: 'admin', expiresAt: new Date(Date.now() + 86400_000).toISOString() })).status).toBe(400);
    expect((await call('POST', `projects/${f.project.id}/invite-links`, f.owner.token, { role: 'editor', expiresAt: new Date().toISOString() })).status).toBe(400);
    expect((await call('POST', 'project-invitations/accept', f.guest.token, { token: 'guess' })).status).toBe(410);
    const link = await f.link();
    await call('POST', `projects/${f.project.id}/collaboration/auth`, f.owner.token);
    vi.spyOn(state, 'persist').mockRejectedValueOnce(new Error('database offline'));
    expect((await call('POST', 'project-invitations/accept', f.guest.token, { token: link.token })).status).toBe(503);
    expect(state.projectGrants.size).toBe(0); expect(rooms.get(f.room)!.usersAccesses[f.guest.user.id]).toBeUndefined();
    await call('POST', 'project-invitations/accept', f.guest.token, { token: link.token });
    state.user(f.owner.user.id).role = 'admin';
    expect((await call('PATCH', `admin/users/${f.guest.user.id}/status`, f.owner.token, { status: 'suspended' })).status).toBe(200);
    expect(rooms.get(f.room)!.usersAccesses[f.guest.user.id]).toBeUndefined();
    vi.stubEnv('PROJECT_INVITES_ENABLED', 'false');
    expect((await call('POST', 'project-invitations/accept', f.other.token, { token: link.token })).status).toBe(503);
  });
});
