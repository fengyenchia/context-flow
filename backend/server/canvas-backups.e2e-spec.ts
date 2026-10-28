import { createHmac } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Y, seedDocument } from '@context-flow/collaboration';
import { GET, POST } from '../app/api/[...path]/route';
import { POST as webhook } from '../app/api/webhooks/liveblocks/route';
import { state } from './state';
import { createSession } from './auth';
import { collectionNames } from './persistence';

const { cloud, objects, failures, calls } = vi.hoisted(() => ({ cloud: new Map<string, Uint8Array>(), objects: new Map<string, { bytes: Uint8Array; date: Date }>(), failures: new Set<string>(), calls: vi.fn() }));
vi.mock('@liveblocks/node', async original => ({
  ...await original<typeof import('@liveblocks/node')>(),
  Liveblocks: class {
    async getRoom(id: string) { if (!cloud.has(id)) throw { status: 404 }; return {}; }
    async getYjsDocumentAsBinaryUpdate(id: string) { if (failures.has('cloud')) throw new Error('cloud offline'); return cloud.get(id)!; }
  },
}));
vi.mock('@aws-sdk/client-s3', async original => ({
  ...await original<typeof import('@aws-sdk/client-s3')>(),
  S3Client: class {
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const { Bucket, Key, Body, Prefix, MaxKeys, ContinuationToken, CopySource, IfNoneMatch } = command.input;
      const name = command.constructor.name;
      calls(name, command.input);
      if (failures.has(name)) throw new Error('storage offline');
      const key = `${Bucket}/${Key}`;
      const missing = () => { throw { $metadata: { httpStatusCode: 404 } }; };
      if (name === 'PutObjectCommand') {
        if (IfNoneMatch === '*' && objects.has(key)) throw { $metadata: { httpStatusCode: 412 } };
        objects.set(key, { bytes: new Uint8Array(Body as Uint8Array), date: new Date() }); return {};
      }
      if (name === 'GetObjectCommand' || name === 'HeadObjectCommand') {
        const found = objects.get(key); if (!found) return missing();
        return { ContentLength: found.bytes.length, Body: { transformToByteArray: async () => found.bytes } };
      }
      if (name === 'CopyObjectCommand') {
        const source = objects.get(decodeURIComponent(String(CopySource))); if (!source) return missing();
        objects.set(key, { bytes: source.bytes.slice(), date: new Date() }); return {};
      }
      if (name === 'ListObjectsV2Command') {
        const entries = [...objects].filter(([id]) => id.startsWith(`${Bucket}/${Prefix}`)).sort(([a], [b]) => a.localeCompare(b));
        const start = Number(ContinuationToken || 0); const end = start + Number(MaxKeys);
        return { Contents: entries.slice(start, end).map(([id, item]) => ({ Key: id.slice(String(Bucket).length + 1), LastModified: item.date, Size: item.bytes.length })), NextContinuationToken: end < entries.length ? String(end) : undefined };
      }
      throw new Error(`Unexpected storage command ${name}`);
    }
  },
}));

const secretBytes = Buffer.alloc(32, 7);
const secret = `whsec_${secretBytes.toString('base64')}`;
async function call(method: 'GET' | 'POST', path: string, token?: string) {
  return ({ GET, POST }[method])(new NextRequest(`http://localhost/api/${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} }), { params: Promise.resolve({ path: path.split('?')[0].split('/') }) });
}
function notify(roomId: string, options: { id?: string; valid?: boolean; updatedAt?: string; type?: string; timestamp?: number } = {}) {
  const rawBody = JSON.stringify({ type: options.type || 'ydocUpdated', data: { roomId, projectId: 'service-project', updatedAt: options.updatedAt || '2026-10-28T01:00:00Z' } });
  const id = options.id || 'event-one'; const timestamp = String(options.timestamp || Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return webhook(new Request('http://localhost/api/webhooks/liveblocks', { method: 'POST', headers: { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${options.valid === false ? 'bad' : signature}` }, body: rawBody }));
}
async function fixture() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const owner = state.createUser({ username: `backup-owner-${suffix}`, displayName: 'Owner', passwordHash: 'unused' }); owner.emailVerifiedAt = new Date();
  const workspace = [...state.workspaces.values()].find(item => item.createdByUserId === owner.id)!;
  const tokens: Record<string, string> = { owner: (await createSession(owner)).accessToken };
  for (const role of ['editor', 'viewer', 'outsider'] as const) {
    const user = state.createUser({ username: `${role}-${suffix}`, displayName: role, passwordHash: 'unused' }); user.emailVerifiedAt = new Date();
    tokens[role] = (await createSession(user)).accessToken;
    if (role !== 'outsider') state.memberships.set(state.memberKey(workspace.id, user.id), { workspaceId: workspace.id, userId: user.id, role, joinedAt: new Date() });
  }
  const id = crypto.randomUUID(); const fileId = crypto.randomUUID();
  const project = { id, workspaceId: workspace.id, name: '備份測試', description: '完整內容', layoutDirection: 'TB' as const, createdByUserId: owner.id, createdAt: new Date() };
  state.projects.set(id, project);
  state.documents.set(fileId, { id: fileId, projectId: id, storageKey: `projects/${id}/${fileId}`, originalName: '附件.txt', mimeType: 'text/plain', sizeBytes: 7, status: 'ready', uploadedByUserId: owner.id, errorMessage: null, createdAt: new Date(), updatedAt: new Date() });
  objects.set(`uploads/projects/${id}/${fileId}`, { bytes: Buffer.from('example'), date: new Date() });
  const snapshot = {
    nodes: [{ id: 'a', position: { x: 12, y: 30 }, style: { background: '#f2c6d2' }, data: { nodeTitle: '資料', nodeContent: '內容', file: `r2://${fileId}` } }, { id: 'diverge-b', position: { x: 80, y: 130 }, data: { nodeTitle: '想法' } }],
    edges: [{ id: 'edge', source: 'a', target: 'diverge-b', label: '共同關係' }], convergenceNodes: [{ id: 'c', data: { nodeTitle: '結論' } }], convergenceEdges: [],
    resources: [{ id: 'resource', kind: 'file', url: `r2://${fileId}`, title: '附件' }], conversations: { global: ['user:問題', 'assistant:回答'] }, summary: '總結',
  };
  const doc = seedDocument(snapshot); const room = `contextflow:project:${id}`;
  cloud.set(room, Y.encodeStateAsUpdate(doc)); doc.destroy();
  state.canvasSnapshots.set(id, { nodes: [], edges: [], updatedAt: new Date() });
  return { project, tokens, room, fileId, snapshot, owner };
}
beforeEach(() => {
  for (const key of collectionNames) state[key].clear(); cloud.clear(); objects.clear(); failures.clear(); calls.mockClear();
  for (const [key, value] of Object.entries({ COLLABORATION_ENABLED: 'true', CANVAS_BACKUP_ENABLED: 'true', LIVEBLOCKS_SECRET_KEY: 'sk_test_fixture', LIVEBLOCKS_WEBHOOK_SECRET: secret, CANVAS_BACKUP_BUCKET_NAME: 'backups', R2_BUCKET_NAME: 'uploads', R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture' })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('canvas backup and restore', () => {
  it('verifies real webhook signatures, copies files once, and makes replay idempotent', async () => {
    const f = await fixture();
    expect((await notify(f.room, { valid: false })).status).toBe(401);
    expect((await notify(f.room, { timestamp: 1 })).status).toBe(401);
    expect(objects.size).toBe(1);
    expect((await notify(f.room)).status).toBe(200);
    expect((await notify(f.room)).status).toBe(200);
    const result = await (await call('GET', `projects/${f.project.id}/backups`, f.tokens.owner)).json();
    expect(result.backups).toHaveLength(1);
    expect(calls.mock.calls.filter(([name]) => name === 'CopyObjectCommand')).toHaveLength(1);
    expect(objects.size).toBe(3);
  });
  it('restores all zones, colors, edges, messages, metadata and files into an independent new project', async () => {
    const f = await fixture();
    const backup = await (await call('POST', `projects/${f.project.id}/backups`, f.tokens.owner)).json();
    // Latest cloud edits and deleted originals must not affect the historical copy.
    const changed = seedDocument({ nodes: [], edges: [] }); cloud.set(f.room, Y.encodeStateAsUpdate(changed)); changed.destroy();
    objects.delete(`uploads/projects/${f.project.id}/${f.fileId}`);
    const restoredResponse = await call('POST', `projects/${f.project.id}/backups/${backup.id}/restore`, f.tokens.owner);
    expect(restoredResponse.status).toBe(201);
    const restored = await restoredResponse.json();
    expect(restored.id).not.toBe(f.project.id);
    expect(restored).toMatchObject({ workspaceId: f.project.workspaceId, layoutDirection: 'TB', description: '完整內容' });
    const snapshot = state.canvasSnapshots.get(restored.id)!;
    expect(snapshot).toMatchObject({ edges: f.snapshot.edges, convergenceNodes: f.snapshot.convergenceNodes, conversations: f.snapshot.conversations, summary: '總結' });
    const file = [...state.documents.values()].find(item => item.projectId === restored.id)!;
    expect(file.id).not.toBe(f.fileId);
    expect(snapshot.nodes[0]).toMatchObject({ position: { x: 12, y: 30 }, style: { background: '#f2c6d2' }, data: { file: `r2://${file.id}` } });
    expect(snapshot.resources![0]).toMatchObject({ url: `r2://${file.id}` });
    expect(Buffer.from(objects.get(`uploads/${file.storageKey}`)!.bytes).toString()).toBe('example');
    expect(state.canvasSnapshots.get(f.project.id)!.nodes).toEqual([]);
    expect(cloud.has(`contextflow:project:${restored.id}`)).toBe(false); // import occurs on first open
  });
  it('denies all backup operations to editors, viewers, outsiders and anonymous users', async () => {
    const f = await fixture();
    for (const token of [f.tokens.editor, f.tokens.viewer, f.tokens.outsider, undefined]) {
      for (const [method, suffix] of [['GET', ''], ['POST', ''], ['POST', '/123-invalid/restore']] as const) {
        expect((await call(method, `projects/${f.project.id}/backups${suffix}`, token)).status).toBe(token ? 403 : 401);
      }
    }
    expect(calls).not.toHaveBeenCalled();
  });
  it('returns retryable failures for storage/cloud outages, then succeeds on retry', async () => {
    const f = await fixture();
    for (const failure of ['cloud', 'CopyObjectCommand', 'PutObjectCommand']) {
      failures.add(failure); expect((await notify(f.room)).status).toBe(503); failures.clear();
    }
    expect((await notify(f.room)).status).toBe(200);
    expect((await (await call('GET', `projects/${f.project.id}/backups`, f.tokens.owner)).json()).backups).toHaveLength(1);
  });
  it('rejects corrupt/unsupported backups and missing files without creating a project', async () => {
    const f = await fixture(); const backup = await (await call('POST', `projects/${f.project.id}/backups`, f.tokens.owner)).json();
    const key = `backups/canvas-backups/v1/${f.project.id}/${backup.id}.json.gz`;
    const original = objects.get(key)!; const envelope = JSON.parse(gunzipSync(original.bytes).toString());
    const count = state.projects.size;
    for (const changed of [{ ...envelope, sha256: 'wrong' }, { ...envelope, version: 99 }, { ...envelope, documents: [{ ...envelope.documents[0], backupStorageKey: 'other-project/file' }] }]) {
      objects.set(key, { ...original, bytes: gzipSync(JSON.stringify(changed)) });
      expect((await call('POST', `projects/${f.project.id}/backups/${backup.id}/restore`, f.tokens.owner)).status).toBe(422);
      expect(state.projects.size).toBe(count);
    }
    objects.set(key, original); objects.delete(`backups/canvas-backups/files/${f.project.id}/${f.fileId}`);
    expect((await call('POST', `projects/${f.project.id}/backups/${backup.id}/restore`, f.tokens.owner)).status).toBe(503);
    expect(state.projects.size).toBe(count);
  });
  it('rolls back project/attachment metadata when the database fails to commit restoration', async () => {
    const f = await fixture(); const backup = await (await call('POST', `projects/${f.project.id}/backups`, f.tokens.owner)).json();
    const count = state.projects.size; const documents = state.documents.size;
    vi.spyOn(state, 'persist').mockRejectedValueOnce(new Error('database offline'));
    expect((await call('POST', `projects/${f.project.id}/backups/${backup.id}/restore`, f.tokens.owner)).status).toBe(503);
    expect(state.projects.size).toBe(count); expect(state.documents.size).toBe(documents);
  });
  it('isolates project prefixes, validates backup IDs, paginates and keeps older versions', async () => {
    const f = await fixture();
    for (let i = 0; i < 32; i++) expect((await notify(f.room, { id: `event-${i}`, updatedAt: new Date(Date.UTC(2026, 9, 28, 0, i)).toISOString() })).status).toBe(200);
    const page = await (await call('GET', `projects/${f.project.id}/backups`, f.tokens.owner)).json();
    expect(page.backups).toHaveLength(30); expect(page.cursor).toBe('30');
    const second = await (await call('GET', `projects/${f.project.id}/backups?cursor=${page.cursor}`, f.tokens.owner)).json();
    expect(second.backups).toHaveLength(2); expect(second.cursor).toBeNull();
    const other = await fixture();
    expect((await call('POST', `projects/${other.project.id}/backups/${page.backups[0].id}/restore`, other.tokens.owner)).status).toBe(404);
    expect((await call('POST', `projects/${f.project.id}/backups/invalid/restore`, f.tokens.owner)).status).toBe(400);
  });
  it('ignores unrelated/deleted rooms and refuses disabled or unsafe configuration', async () => {
    const f = await fixture();
    expect((await notify('another-app:room')).status).toBe(200);
    expect((await notify('contextflow:project:deleted')).status).toBe(200);
    expect(calls).not.toHaveBeenCalled();
    vi.stubEnv('CANVAS_BACKUP_BUCKET_NAME', 'uploads');
    expect((await notify(f.room)).status).toBe(503);
    vi.stubEnv('CANVAS_BACKUP_ENABLED', 'false');
    expect((await notify(f.room)).status).toBe(503);
    expect((await call('POST', `projects/${f.project.id}/backups`, f.tokens.owner)).status).toBe(503);
  });
  it('never acknowledges an unsupported cloud schema or an unbacked file reference', async () => {
    const f = await fixture();
    const invalid = new Y.Doc(); cloud.set(f.room, Y.encodeStateAsUpdate(invalid)); invalid.destroy();
    expect((await notify(f.room)).status).toBe(503);
    const missing = seedDocument({ nodes: [], edges: [], resources: [{ id: 'missing', url: 'r2://unknown-file' }] });
    cloud.set(f.room, Y.encodeStateAsUpdate(missing)); missing.destroy();
    expect((await notify(f.room)).status).toBe(503);
    expect((await (await call('GET', `projects/${f.project.id}/backups`, f.tokens.owner)).json()).backups).toEqual([]);
  });
});
