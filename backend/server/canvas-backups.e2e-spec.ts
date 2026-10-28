import { createHash, createHmac } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Y, seedDocument } from '@context-flow/collaboration';
import { GET, POST } from '../app/api/[...path]/route';
import { POST as webhook } from '../app/api/webhooks/liveblocks/route';
import { state } from './state';
import { createSession } from './auth';
import { collectionNames } from './persistence';
import { backupProjectPage, backupReferences, captureCanvasBackup, cleanupCanvasBackups, finishBackupCleanup, prepareBackupCleanup, restoreCanvasBackup } from './canvas-backups';

const { cloud, objects, failures, calls, queued } = vi.hoisted(() => ({ cloud: new Map<string, Uint8Array>(), objects: new Map<string, { bytes: Uint8Array; date: Date }>(), failures: new Set<string>(), calls: vi.fn(), queued: vi.fn() }));
vi.mock('./inngest-client', () => ({ inngest: { send: queued } }));
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
      const { Bucket, Key, Body, Prefix, MaxKeys, ContinuationToken, CopySource, IfNoneMatch, Delimiter } = command.input;
      const name = command.constructor.name;
      calls(name, command.input);
      if (failures.has(name)) throw new Error('storage offline');
      const key = `${Bucket}/${Key}`;
      const missing = () => { throw { $metadata: { httpStatusCode: 404 } }; };
      if (name === 'DeleteObjectCommand') { objects.delete(key); return {}; }
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
        if (failures.has('truncate')) return { Contents: [], IsTruncated: true };
        if (Delimiter) {
          const prefixes = [...new Set(entries.map(([id]) => id.slice(String(Bucket).length + 1).split('/').slice(0, 3).join('/') + '/'))];
          return { CommonPrefixes: prefixes.slice(start, end).map(Prefix => ({ Prefix })), NextContinuationToken: end < prefixes.length ? String(end) : undefined };
        }
        return { Contents: entries.slice(start, end).map(([id, item]) => ({ Key: id.slice(String(Bucket).length + 1), LastModified: item.date, Size: item.bytes.length })), NextContinuationToken: end < entries.length ? String(end) : undefined, IsTruncated: end < entries.length };
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
  queued.mockReset(); queued.mockResolvedValue({ ids: ['queued'] });
  for (const [key, value] of Object.entries({ COLLABORATION_ENABLED: 'true', CANVAS_BACKUP_ENABLED: 'true', LIVEBLOCKS_SECRET_KEY: 'sk_test_fixture', LIVEBLOCKS_WEBHOOK_SECRET: secret, CANVAS_BACKUP_BUCKET_NAME: 'backups', R2_BUCKET_NAME: 'uploads', R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture' })) vi.stubEnv(key, value);
});

describe('bounded backup retention and safe attachment cleanup', () => {
  beforeEach(() => {
    vi.stubEnv('CANVAS_BACKUP_RETENTION_ENABLED', 'true');
    vi.stubEnv('INNGEST_EVENT_KEY', 'fixture-event-key'); vi.stubEnv('INNGEST_SIGNING_KEY', 'fixture-signing-key');
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-28T04:00:00Z'));
  });
  const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
  const manifestKeys = (id: string) => [...objects.keys()].filter(key => key.startsWith(`backups/canvas-backups/v1/${id}/`));
  const change = (room: string, snapshot: Parameters<typeof seedDocument>[0]) => { const doc = seedDocument(snapshot); cloud.set(room, Y.encodeStateAsUpdate(doc)); doc.destroy(); };

  it('deduplicates logical content even if Yjs clocks and upload metadata changed', async () => {
    const f = await fixture(); const first = await captureCanvasBackup(f.project.id);
    change(f.room, f.snapshot); advance(60_000);
    state.documents.get(f.fileId)!.updatedAt = new Date();
    const duplicate = await captureCanvasBackup(f.project.id);
    expect(duplicate).toMatchObject({ id: first.id, skipped: 'unchanged' });
    expect(manifestKeys(f.project.id)).toHaveLength(1);
    expect(calls.mock.calls.filter(([name]) => name === 'CopyObjectCommand')).toHaveLength(1);
    expect(queued).not.toHaveBeenCalled();
  });
  it('queues the last changed document until the 15-minute interval and backs it up without another edit', async () => {
    const f = await fixture(); const first = await captureCanvasBackup(f.project.id);
    advance(5 * 60_000); const changed = structuredClone(f.snapshot); changed.nodes[0].data.nodeContent = '最後一次修改'; change(f.room, changed);
    for (const id of ['second', 'third']) expect((await captureCanvasBackup(f.project.id, { id, updatedAt: new Date().toISOString() })).skipped).toBe('scheduled');
    expect(manifestKeys(f.project.id)).toHaveLength(1);
    const event = queued.mock.calls[0][0]; expect(event).toEqual(queued.mock.calls[1][0]);
    expect(event.data.dueAt).toBe(new Date(Date.parse(first.capturedAt) + 15 * 60_000).toISOString());
    vi.setSystemTime(new Date(Date.parse(event.data.dueAt) + 1));
    const saved = await captureCanvasBackup(f.project.id, { id: event.id, updatedAt: new Date().toISOString() });
    expect(saved.skipped).toBeUndefined(); expect(manifestKeys(f.project.id)).toHaveLength(2);
    const restored = await restoreCanvasBackup(f.project.id, saved.id, f.owner.id);
    expect(state.canvasSnapshots.get(restored.id)!.nodes[0]).toMatchObject({ data: { nodeContent: '最後一次修改' } });
  });
  it('allows a changed manual backup immediately and applies the normal interval after it', async () => {
    const f = await fixture(); await captureCanvasBackup(f.project.id); advance(60_000);
    const changed = structuredClone(f.snapshot); changed.summary = '手動重要版本'; change(f.room, changed);
    const manual = await captureCanvasBackup(f.project.id); expect(manual.skipped).toBeUndefined();
    advance(60_000); changed.summary = '後續修改'; change(f.room, changed);
    const auto = await captureCanvasBackup(f.project.id, { id: 'auto', updatedAt: new Date().toISOString() });
    expect(auto.nextBackupAt).toBe(new Date(Date.parse(manual.capturedAt) + 15 * 60_000).toISOString());
    expect(manifestKeys(f.project.id)).toHaveLength(2);
  });
  it('retains at most 50 manual/automatic versions and rejects restoring a pruned ID', async () => {
    const f = await fixture(); const first = await captureCanvasBackup(f.project.id);
    for (let i = 1; i < 55; i++) { advance(60_000); const next = structuredClone(f.snapshot); next.summary = `版本 ${i}`; change(f.room, next); await captureCanvasBackup(f.project.id); }
    expect(manifestKeys(f.project.id)).toHaveLength(50);
    await expect(restoreCanvasBackup(f.project.id, first.id, f.owner.id)).rejects.toMatchObject({ status: 404 });
    expect(objects.has(`backups/canvas-backups/files/${f.project.id}/${f.fileId}`)).toBe(true);
  });
  it('protects attachments referenced by older retained versions, then removes only unused backup copies', async () => {
    const f = await fixture(); const first = await captureCanvasBackup(f.project.id);
    advance(2 * 86400_000); change(f.room, { nodes: [], edges: [], resources: [] }); await captureCanvasBackup(f.project.id);
    objects.delete(`uploads/projects/${f.project.id}/${f.fileId}`);
    await cleanupCanvasBackups(f.project.id);
    const fileKey = `backups/canvas-backups/files/${f.project.id}/${f.fileId}`;
    expect(objects.has(fileKey)).toBe(true);
    const restored = await restoreCanvasBackup(f.project.id, first.id, f.owner.id);
    const restoredFile = [...state.documents.values()].find(item => item.projectId === restored.id)!;
    advance(29 * 86400_000); await cleanupCanvasBackups(f.project.id);
    expect(manifestKeys(f.project.id)).toHaveLength(1); expect(objects.has(fileKey)).toBe(false);
    expect(objects.has(`uploads/${restoredFile.storageKey}`)).toBe(true);
    expect(calls.mock.calls.filter(([name, input]) => name === 'DeleteObjectCommand' && input.Bucket === 'uploads')).toHaveLength(0);
  });
  it('protects the current cloud references and recent incomplete copies, and isolates other projects', async () => {
    const f = await fixture(); await captureCanvasBackup(f.project.id);
    const recentKey = `backups/canvas-backups/files/${f.project.id}/recent-copy`;
    const otherKey = 'backups/canvas-backups/files/other-project/old-copy';
    advance(31 * 86400_000); objects.set(recentKey, { bytes: Buffer.from('recent'), date: new Date() }); objects.set(otherKey, { bytes: Buffer.from('other'), date: new Date(0) });
    await cleanupCanvasBackups(f.project.id);
    expect(manifestKeys(f.project.id)).toHaveLength(0);
    expect(objects.has(`backups/canvas-backups/files/${f.project.id}/${f.fileId}`)).toBe(true);
    expect(objects.has(recentKey)).toBe(true); expect(objects.has(otherKey)).toBe(true);
    advance(25 * 3600_000); await cleanupCanvasBackups(f.project.id);
    expect(objects.has(recentKey)).toBe(false); expect(objects.has(otherKey)).toBe(true);
    expect(objects.has(`uploads/projects/${f.project.id}/${f.fileId}`)).toBe(true);
  });
  it('does not delete attachments after corrupt manifests, incomplete listings, cloud read or deletion failures', async () => {
    const f = await fixture(); await captureCanvasBackup(f.project.id); advance(2 * 86400_000);
    const orphan = `backups/canvas-backups/files/${f.project.id}/orphan-file`; objects.set(orphan, { bytes: Buffer.from('orphan'), date: new Date(0) });
    const key = manifestKeys(f.project.id)[0], original = objects.get(key)!;
    objects.set(key, { ...original, bytes: Buffer.from('corrupt') });
    await expect(cleanupCanvasBackups(f.project.id)).rejects.toMatchObject({ status: 422 }); expect(objects.has(orphan)).toBe(true);
    objects.set(key, original);
    for (const failure of ['truncate', 'GetObjectCommand', 'cloud']) { failures.add(failure); await expect(cleanupCanvasBackups(f.project.id)).rejects.toBeDefined(); failures.clear(); expect(objects.has(orphan)).toBe(true); }
    failures.add('DeleteObjectCommand'); advance(31 * 86400_000);
    await expect(cleanupCanvasBackups(f.project.id)).rejects.toBeDefined(); expect(objects.has(orphan)).toBe(true); expect(objects.has(key)).toBe(true);
    failures.clear(); await cleanupCanvasBackups(f.project.id); expect(objects.has(orphan)).toBe(false);
  });
  it('rechecks the inventory before a durable cleanup deletes files when a newer backup arrived', async () => {
    const f = await fixture(); await captureCanvasBackup(f.project.id); advance(2 * 86400_000);
    const orphan = `backups/canvas-backups/files/${f.project.id}/orphan-file`; objects.set(orphan, { bytes: Buffer.from('old'), date: new Date(0) });
    const plan = await prepareBackupCleanup(f.project.id); const refs = await backupReferences(f.project.id, plan.ids);
    const changed = structuredClone(f.snapshot); changed.summary = '新的備份'; change(f.room, changed); await captureCanvasBackup(f.project.id);
    expect(await finishBackupCleanup(f.project.id, plan.ids, refs)).toMatchObject({ deletedFiles: 0, more: true }); expect(objects.has(orphan)).toBe(true);
    const current = await prepareBackupCleanup(f.project.id);
    await finishBackupCleanup(f.project.id, current.ids, await backupReferences(f.project.id, current.ids));
    expect(objects.has(orphan)).toBe(false);
  });
  it('serializes simultaneous publishers and never acknowledges a deferred backup without a working queue', async () => {
    const f = await fixture();
    await Promise.all([captureCanvasBackup(f.project.id), captureCanvasBackup(f.project.id)]);
    expect(manifestKeys(f.project.id)).toHaveLength(1);
    advance(60_000); const changed = structuredClone(f.snapshot); changed.summary = '尚未排程'; change(f.room, changed);
    queued.mockRejectedValueOnce(new Error('queue unavailable'));
    await expect(captureCanvasBackup(f.project.id, { id: 'later', updatedAt: new Date().toISOString() })).rejects.toThrow('queue unavailable');
    expect(manifestKeys(f.project.id)).toHaveLength(1);
    vi.stubEnv('INNGEST_EVENT_KEY', '');
    await expect(captureCanvasBackup(f.project.id, { id: 'later', updatedAt: new Date().toISOString() })).rejects.toMatchObject({ status: 503 });
  });
  it('includes deleted projects in the daily inventory and can finish large cleanup in bounded batches', async () => {
    const f = await fixture(); await captureCanvasBackup(f.project.id);
    const page = await backupProjectPage(); expect(page.projectIds).toContain(f.project.id);
    state.projects.delete(f.project.id); state.documents.delete(f.fileId); advance(31 * 86400_000);
    for (let i = 0; i < 105; i++) objects.set(`backups/canvas-backups/files/${f.project.id}/orphan-${i}`, { bytes: Buffer.from('old'), date: new Date(0) });
    const first = await cleanupCanvasBackups(f.project.id); expect(first.deletedFiles).toBe(100); expect(first.more).toBe(true);
    expect((await backupProjectPage()).projectIds).not.toContain(f.project.id);
    expect((await backupProjectPage(undefined, true)).projectIds).toContain(f.project.id);
    const last = await cleanupCanvasBackups(f.project.id); expect(last.more).toBe(false);
    expect([...objects.keys()].filter(key => key.startsWith(`backups/canvas-backups/files/${f.project.id}/`))).toHaveLength(0);
  });
  it('keeps the full interval when storage timestamps lose milliseconds', async () => {
    advance(789); const f = await fixture(); const first = await captureCanvasBackup(f.project.id);
    const manifest = objects.get(manifestKeys(f.project.id)[0])!;
    manifest.date = new Date(Math.floor(manifest.date.getTime() / 1000) * 1000);
    advance(60_000); const changed = structuredClone(f.snapshot); changed.summary = '最後變更'; change(f.room, changed);
    await captureCanvasBackup(f.project.id, { id: 'rounded-time', updatedAt: new Date().toISOString() });
    expect(queued).toHaveBeenCalledWith(expect.objectContaining({ data: { projectId: f.project.id, dueAt: new Date(Date.parse(first.capturedAt) + 900_000).toISOString() } }));
  });
  it('refuses production cleanup when database configuration is missing', async () => {
    const f = await fixture(); await captureCanvasBackup(f.project.id); advance(31 * 86400_000);
    vi.stubEnv('NODE_ENV', 'production'); calls.mockClear();
    await expect(cleanupCanvasBackups(f.project.id)).rejects.toThrow('production database');
    expect(calls.mock.calls.some(([name]) => name === 'DeleteObjectCommand')).toBe(false);
  });
  it('preserves copies if a checksummed manifest omits a referenced attachment', async () => {
    const f = await fixture(); await captureCanvasBackup(f.project.id); advance(2 * 86400_000);
    const manifest = objects.get(manifestKeys(f.project.id)[0])!;
    const payload = JSON.parse(gunzipSync(manifest.bytes).toString()); delete payload.sha256; payload.documents = [];
    manifest.bytes = gzipSync(JSON.stringify({ ...payload, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') }));
    const changed = structuredClone(f.snapshot); changed.nodes = []; changed.resources = []; change(f.room, changed);
    calls.mockClear(); await expect(cleanupCanvasBackups(f.project.id)).rejects.toMatchObject({ status: 422 });
    expect(objects.has(`backups/canvas-backups/files/${f.project.id}/${f.fileId}`)).toBe(true);
    expect(calls.mock.calls.some(([name]) => name === 'DeleteObjectCommand')).toBe(false);
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

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
