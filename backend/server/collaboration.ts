import { Liveblocks } from '@liveblocks/node';
import { Y, readSnapshot, seedDocument, type Snapshot } from '@context-flow/collaboration';
import { ApiProblem, state, type User } from './state';

export const collaborationEnabled = () => process.env.COLLABORATION_ENABLED === 'true';
const roomId = (projectId: string) => `contextflow:project:${projectId}`;
function service() {
  if (!process.env.LIVEBLOCKS_SECRET_KEY) throw new ApiProblem(503, '即時共編尚未設定，請聯絡管理員');
  return new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY });
}
const is404 = (error: unknown) => !!error && typeof error === 'object' && 'status' in error && error.status === 404;

export async function ensureRoom(projectId: string) {
  const project = state.project(projectId);
  const client = service();
  const id = roomId(projectId);
  try { await client.getRoom(id); }
  catch (error) {
    if (!is404(error)) throw error;
    try { await client.createRoom(id, { defaultAccesses: [] }); }
    catch (created) {
      if (!(created && typeof created === 'object' && 'status' in created && created.status === 409)) throw created;
    }
  }
  const binary = await client.getYjsDocumentAsBinaryUpdate(id);
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, new Uint8Array(binary));
    if (!doc.getMap('meta').has('schema')) {
      const seeded = seedDocument((state.canvasSnapshots.get(project.id) || { nodes: [], edges: [] }) as Snapshot);
      try { await client.sendYjsBinaryUpdate(id, Y.encodeStateAsUpdate(seeded)); }
      finally { seeded.destroy(); }
    }
  } finally { doc.destroy(); }
  return { client, id };
}

/** ID-token permissions are held by the room, so removals also revoke existing sessions. */
export async function syncRoomPermissions(projectId: string, create = false, revokeOnly = false) {
  if (!collaborationEnabled()) return;
  const project = state.project(projectId);
  const client = service();
  const id = roomId(projectId);
  let room;
  try { room = await client.getRoom(id); }
  catch (error) {
    if (!is404(error)) throw error;
    if (!create) return;
    await ensureRoom(projectId);
    room = await client.getRoom(id);
  }
  const usersAccesses: Record<string, ['room:write'] | ['room:read', 'room:presence:write'] | null> = {};
  for (const userId of Object.keys(room.usersAccesses)) usersAccesses[userId] = null;
  for (const member of state.memberships.values()) {
    if (member.workspaceId !== project.workspaceId || state.users.get(member.userId)?.status !== 'active') continue;
    usersAccesses[member.userId] = member.role === 'viewer' ? ['room:read', 'room:presence:write'] : ['room:write'];
  }
  for (const grant of state.projectGrants.values()) {
    const role = state.projectRole(projectId, grant.userId);
    if (role && state.projectLinks.get(grant.linkId)?.projectId === projectId) usersAccesses[grant.userId] = role === 'viewer' ? ['room:read', 'room:presence:write'] : ['room:write'];
  }
  if (revokeOnly) {
    for (const [userId, desired] of Object.entries(usersAccesses)) {
      const previous = room.usersAccesses[userId] || [];
      if (!desired || !previous.length) usersAccesses[userId] = null;
      else if (desired[0] === 'room:write' && previous.includes('room:write')) usersAccesses[userId] = ['room:write'];
      else if (previous.includes('room:read') || previous.includes('room:write')) usersAccesses[userId] = ['room:read', 'room:presence:write'];
      else usersAccesses[userId] = null;
    }
  }
  await client.updateRoom(id, { defaultAccesses: [], usersAccesses });
}

export async function syncWorkspaceRooms(workspaceId: string, revokeOnly = false) {
  for (const project of state.projects.values()) if (project.workspaceId === workspaceId) await syncRoomPermissions(project.id, false, revokeOnly);
}
export async function authorizeCollaboration(projectId: string, user: User) {
  const project = state.project(projectId);
  state.requireProjectRole(project.id, user.id, ['owner', 'admin', 'editor', 'viewer']);
  if (!collaborationEnabled()) throw new ApiProblem(503, '即時共編尚未啟用');
  const { client, id } = await ensureRoom(projectId);
  await syncRoomPermissions(projectId, true);
  const result = await client.identifyUser({ userId: user.id, groupIds: [] }, { userInfo: { name: user.displayName } });
  if (result.status !== 200) throw new ApiProblem(503, '即時共編授權暫時無法使用');
  return { ...JSON.parse(result.body) as { token: string }, roomId: id };
}
export async function readCollaborativeCanvas(projectId: string) {
  const { client, id } = await ensureRoom(projectId);
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, new Uint8Array(await client.getYjsDocumentAsBinaryUpdate(id)));
    return { ...readSnapshot(doc), updatedAt: null };
  } finally { doc.destroy(); }
}
export async function deleteCollaborativeRoom(projectId: string) {
  if (collaborationEnabled()) await service().deleteRoom(roomId(projectId));
}
export async function revokeCollaborativeRoom(projectId: string) {
  if (!collaborationEnabled()) return;
  const client = service();
  try {
    const room = await client.getRoom(roomId(projectId));
    await client.updateRoom(roomId(projectId), { defaultAccesses: [], usersAccesses: Object.fromEntries(Object.keys(room.usersAccesses).map(id => [id, null])) });
  } catch (error) { if (!is404(error)) throw error; }
}
