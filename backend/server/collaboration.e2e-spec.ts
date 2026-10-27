import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Y, readSnapshot } from '@context-flow/collaboration';
import { GET, POST, PUT, PATCH, DELETE } from '../app/api/[...path]/route';
import { state } from './state';
import { createSession } from './auth';
import { collectionNames } from './persistence';

const { rooms, authorize } = vi.hoisted(() => ({ rooms: new Map<string, { doc: Uint8Array; usersAccesses: Record<string, string[]> }>(), authorize: vi.fn() }));
vi.mock('@liveblocks/node', () => ({ Liveblocks: class {
  async getRoom(id: string) { const room = rooms.get(id); if (!room) throw { status: 404 }; return room; }
  async createRoom(id: string) { if (rooms.has(id)) throw { status: 409 }; rooms.set(id, { doc: new Uint8Array([0, 0]), usersAccesses: {} }); }
  async updateRoom(id: string, input: { usersAccesses: Record<string, string[] | null> }) {
    const room = rooms.get(id)!;
    for (const [userId, access] of Object.entries(input.usersAccesses)) {
      if (access) room.usersAccesses[userId] = access; else delete room.usersAccesses[userId];
    }
  }
  async getYjsDocumentAsBinaryUpdate(id: string) { return rooms.get(id)!.doc; }
  async sendYjsBinaryUpdate(id: string, update: Uint8Array) {
    const doc = new Y.Doc(); Y.applyUpdate(doc, rooms.get(id)!.doc); Y.applyUpdate(doc, update);
    rooms.get(id)!.doc = Y.encodeStateAsUpdate(doc); doc.destroy();
  }
  async identifyUser(identity: { userId: string }) { authorize(identity); return { status: 200, body: JSON.stringify({ token: `test-${identity.userId}` }) }; }
  async deleteRoom(id: string) { rooms.delete(id); }
} }));

async function call(method: string, path: string, token?: string, data?: unknown) {
  const request = new NextRequest(`http://localhost/api/${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return ({ GET, POST, PUT, PATCH, DELETE }[method]!) (request, { params: Promise.resolve({ path: path.split('/') }) });
}
async function user(name: string) {
  const account = state.createUser({ username: name, displayName: name, passwordHash: 'not-used', email: `${name}@example.test` });
  account.emailVerifiedAt = new Date();
  return { user: account, token: (await createSession(account)).accessToken };
}
beforeEach(() => {
  vi.stubEnv('COLLABORATION_ENABLED', 'true'); vi.stubEnv('LIVEBLOCKS_SECRET_KEY', 'sk_test_not-a-real-key');
  for (const collection of collectionNames) state[collection].clear();
  rooms.clear(); authorize.mockClear();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('collaboration authorization and migration API', () => {
  async function fixture() {
    const owner = await user('owner'); const editor = await user('editor'); const viewer = await user('viewer'); const outsider = await user('outsider');
    const workspace = await (await call('POST', 'workspaces', owner.token, { name: '協作' })).json();
    for (const [account, role] of [[editor, 'editor'], [viewer, 'viewer']] as const) state.memberships.set(state.memberKey(workspace.id, account.user.id), { workspaceId: workspace.id, userId: account.user.id, role, joinedAt: new Date() });
    const project = await (await call('POST', `workspaces/${workspace.id}/projects`, owner.token, { name: '共同畫布' })).json();
    state.canvasSnapshots.set(project.id, { nodes: [{ id: 'legacy', position: { x: 0, y: 0 }, data: { nodeTitle: '舊資料' } }], edges: [], updatedAt: new Date() });
    return { owner, editor, viewer, outsider, workspace, project, room: `contextflow:project:${project.id}` };
  }
  it('imports legacy content, gives each role the right room access, and blocks stale whole-canvas PUT', async () => {
    const f = await fixture();
    for (const account of [f.owner, f.editor, f.viewer]) expect((await call('POST', `projects/${f.project.id}/collaboration/auth`, account.token)).status).toBe(200);
    expect(rooms.get(f.room)!.usersAccesses).toMatchObject({ [f.owner.user.id]: ['room:write'], [f.editor.user.id]: ['room:write'], [f.viewer.user.id]: ['room:read', 'room:presence:write'] });
    const snapshot = await (await call('GET', `projects/${f.project.id}/canvas`, f.viewer.token)).json();
    expect(snapshot.nodes[0].data.nodeTitle).toBe('舊資料');
    expect((await call('PUT', `projects/${f.project.id}/canvas`, f.editor.token, { nodes: [], edges: [], baseUpdatedAt: null })).status).toBe(409);
    expect((await call('PUT', `projects/${f.project.id}/canvas`, f.viewer.token, { nodes: [], edges: [] })).status).toBe(403);
    expect((await call('GET', `projects/${f.project.id}`, f.owner.token)).status).toBe(200);
  });
  it('rejects unauthenticated users, nonmembers and guessed project IDs before issuing any token', async () => {
    const f = await fixture();
    expect((await call('POST', `projects/${f.project.id}/collaboration/auth`)).status).toBe(401);
    expect((await call('POST', `projects/${f.project.id}/collaboration/auth`, f.outsider.token)).status).toBe(403);
    expect((await call('POST', 'projects/missing/collaboration/auth', f.owner.token)).status).toBe(404);
    expect(authorize).not.toHaveBeenCalled();
  });
  it('revokes room permissions when a member is downgraded or removed, and deletes the room with its project', async () => {
    const f = await fixture();
    await call('POST', `projects/${f.project.id}/collaboration/auth`, f.editor.token);
    expect((await call('PATCH', `workspaces/${f.workspace.id}/members/${f.editor.user.id}`, f.owner.token, { role: 'viewer' })).status).toBe(200);
    expect(rooms.get(f.room)!.usersAccesses[f.editor.user.id]).toEqual(['room:read', 'room:presence:write']);
    expect((await call('DELETE', `workspaces/${f.workspace.id}/members/${f.editor.user.id}`, f.owner.token)).status).toBe(200);
    expect(rooms.get(f.room)!.usersAccesses[f.editor.user.id]).toBeUndefined();
    expect((await call('POST', `projects/${f.project.id}/collaboration/auth`, f.editor.token)).status).toBe(403);
    expect((await call('DELETE', `projects/${f.project.id}`, f.owner.token)).status).toBe(200);
    expect(rooms.has(f.room)).toBe(false);
  });
  it('reads the saved CRDT document instead of restoring the old Neon bootstrap snapshot', async () => {
    const f = await fixture();
    await call('POST', `projects/${f.project.id}/collaboration/auth`, f.owner.token);
    const doc = new Y.Doc(); Y.applyUpdate(doc, rooms.get(f.room)!.doc);
    doc.getText(JSON.stringify(['nodes', 'legacy', 'data', 'nodeTitle'])).insert(0, '共同更新：');
    rooms.get(f.room)!.doc = Y.encodeStateAsUpdate(doc);
    const saved = await (await call('GET', `projects/${f.project.id}/canvas`, f.editor.token)).json();
    expect(saved).toMatchObject(readSnapshot(doc));
    expect(saved.nodes[0].data.nodeTitle).toBe('共同更新：舊資料');
    expect((state.canvasSnapshots.get(f.project.id)!.nodes[0] as { data: { nodeTitle: string } }).data.nodeTitle).toBe('舊資料');
  });
  it('fails closed when enabled without a service key; never silently reverts to stale snapshots', async () => {
    const f = await fixture(); vi.stubEnv('LIVEBLOCKS_SECRET_KEY', '');
    expect((await call('GET', `projects/${f.project.id}/canvas`, f.owner.token)).status).toBe(503);
    expect((await call('POST', `projects/${f.project.id}/collaboration/auth`, f.owner.token)).status).toBe(503);
  });
  it('never grants a promotion if the database commit fails', async () => {
    const f = await fixture();
    await call('POST', `projects/${f.project.id}/collaboration/auth`, f.viewer.token);
    vi.spyOn(state, 'persist').mockRejectedValueOnce(new Error('simulated commit failure'));
    expect((await call('PATCH', `workspaces/${f.workspace.id}/members/${f.viewer.user.id}`, f.owner.token, { role: 'editor' })).status).toBe(503);
    expect(state.member(f.workspace.id, f.viewer.user.id)!.role).toBe('viewer');
    expect(rooms.get(f.room)!.usersAccesses[f.viewer.user.id]).toEqual(['room:read', 'room:presence:write']);
  });
  it('keeps shared data recoverable if deleting the Neon project fails', async () => {
    const f = await fixture();
    await call('POST', `projects/${f.project.id}/collaboration/auth`, f.owner.token);
    vi.spyOn(state, 'persist').mockRejectedValueOnce(new Error('simulated commit failure'));
    expect((await call('DELETE', `projects/${f.project.id}`, f.owner.token)).status).toBe(503);
    expect(rooms.has(f.room)).toBe(true);
    expect(rooms.get(f.room)!.usersAccesses).toEqual({});
    expect((await call('POST', `projects/${f.project.id}/collaboration/auth`, f.owner.token)).status).toBe(200);
    const restored = await (await call('GET', `projects/${f.project.id}/canvas`, f.owner.token)).json();
    expect(restored.nodes[0].data.nodeTitle).toBe('舊資料');
  });
  it('revokes all project room access when an account is suspended', async () => {
    const f = await fixture();
    await call('POST', `projects/${f.project.id}/collaboration/auth`, f.editor.token);
    state.user(f.owner.user.id).role = 'admin';
    expect((await call('PATCH', `admin/users/${f.editor.user.id}/status`, f.owner.token, { status: 'suspended' })).status).toBe(200);
    expect(rooms.get(f.room)!.usersAccesses[f.editor.user.id]).toBeUndefined();
    expect((await call('POST', `projects/${f.project.id}/collaboration/auth`, f.editor.token)).status).toBe(401);
  });
});
