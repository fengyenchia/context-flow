import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from '../app/api/[...path]/route';
import { state } from './state';
import { createSession } from './auth';
import { collectionNames } from './persistence';
import { cleanupOriginalProjectFiles, originalCleanupProjectPage } from './original-file-cleanup';

const fake = vi.hoisted(() => ({ objects: new Map<string, { date: Date }>(), calls: vi.fn(), failures: new Set<string>(), truncate: false }));
vi.mock('@aws-sdk/client-s3', async original => ({
  ...await original<typeof import('@aws-sdk/client-s3')>(),
  S3Client: class {
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const { Bucket, Key, Prefix, Delimiter, MaxKeys, ContinuationToken, StartAfter } = command.input;
      const name = command.constructor.name; fake.calls(name, command.input);
      if (fake.failures.has(name)) throw new Error('R2 unavailable');
      const key = `${Bucket}/${Key}`;
      if (name === 'HeadObjectCommand') { const object = fake.objects.get(key); if (!object) throw { $metadata: { httpStatusCode: 404 } }; return { LastModified: object.date }; }
      if (name === 'PutObjectCommand') { if (fake.objects.has(key)) throw { $metadata: { httpStatusCode: 412 } }; fake.objects.set(key, { date: new Date() }); return {}; }
      if (name === 'DeleteObjectCommand') { fake.objects.delete(key); return {}; }
      if (name === 'ListObjectsV2Command') {
        if (fake.truncate) return { IsTruncated: true, Contents: [] };
        let keys = [...fake.objects.keys()].filter(key => key.startsWith(`${Bucket}/${Prefix}`)).map(key => key.slice(String(Bucket).length + 1)).sort();
        if (StartAfter) keys = keys.filter(key => key > String(StartAfter));
        if (Delimiter) keys = [...new Set(keys.map(key => key.slice(0, key.indexOf('/', String(Prefix).length) + 1)).filter(Boolean))];
        const start = Number(ContinuationToken || 0), end = start + Number(MaxKeys || 100);
        return { [Delimiter ? 'CommonPrefixes' : 'Contents']: keys.slice(start, end).map(key => Delimiter ? { Prefix: key } : { Key: key, LastModified: fake.objects.get(`${Bucket}/${key}`)!.date }), IsTruncated: end < keys.length, NextContinuationToken: end < keys.length ? String(end) : undefined };
      }
      throw new Error(`Unexpected ${name}`);
    }
  },
}));
beforeEach(() => {
  for (const name of collectionNames) state[name].clear(); fake.objects.clear(); fake.calls.mockReset(); fake.failures.clear(); fake.truncate = false;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-28T04:00:00Z'));
  for (const [key, value] of Object.entries({ R2_PROJECT_CLEANUP_ENABLED: 'true', R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture', R2_BUCKET_NAME: 'uploads', CANVAS_BACKUP_BUCKET_NAME: 'backups', COLLABORATION_ENABLED: 'false' })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const advance = (hours: number) => vi.setSystemTime(Date.now() + hours * 3600_000);
const marker = (id: string) => `uploads/project-file-cleanup/v1/${id}.json`;
const file = (projectId: string) => `uploads/projects/${projectId}/${randomUUID()}`;
async function deletedFixture() {
  const id = randomUUID(); const key = file(id); fake.objects.set(key, { date: new Date(0) });
  await cleanupOriginalProjectFiles(id); advance(25); return { id, key };
}

it('waits 24 hours after first confirmed absence and retains newly uploaded files', async () => {
  const id = randomUUID(), old = file(id), recent = file(id);
  fake.objects.set(old, { date: new Date(0) });
  expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ skipped: 'grace', deletedFiles: 0 });
  advance(23); expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ skipped: 'grace' });
  advance(2); fake.objects.set(recent, { date: new Date() });
  expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ deletedFiles: 1 });
  expect(fake.objects.has(old)).toBe(false); expect(fake.objects.has(recent)).toBe(true); expect(fake.objects.has(marker(id))).toBe(true);
  advance(25); await cleanupOriginalProjectFiles(id); expect(fake.objects.has(recent)).toBe(false); expect(fake.objects.has(marker(id))).toBe(false);
});
it('never deletes live project files, cross-project references, restored files or backup copies', async () => {
  const { id, key } = await deletedFixture();
  const activeId = randomUUID(), activeKey = file(activeId), restoredKey = file(randomUUID());
  const backup = `backups/canvas-backups/files/${id}/${randomUUID()}`;
  for (const path of [activeKey, restoredKey, backup]) fake.objects.set(path, { date: new Date(0) });
  state.projects.set(activeId, { id: activeId } as never);
  const documentId = randomUUID(); state.documents.set(documentId, { id: documentId, projectId: activeId, storageKey: key.slice('uploads/'.length) } as never);
  await cleanupOriginalProjectFiles(id); await cleanupOriginalProjectFiles(activeId);
  for (const path of [key, activeKey, restoredKey, backup]) expect(fake.objects.has(path)).toBe(true);
  expect(fake.calls.mock.calls.filter(([name]) => name === 'DeleteObjectCommand').every(([, input]) => input.Bucket === 'uploads')).toBe(true);
});
it('resets the grace marker when a project reappears', async () => {
  const { id, key } = await deletedFixture(); state.projects.set(id, { id } as never);
  expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ skipped: 'active' }); expect(fake.objects.has(marker(id))).toBe(false);
  state.projects.delete(id); expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ skipped: 'grace' }); expect(fake.objects.has(key)).toBe(true);
});
it('stops the current batch when a project reappears between object deletions', async () => {
  const { id } = await deletedFixture(); fake.objects.set(file(id), { date: new Date(0) });
  fake.calls.mockImplementation((name: string, input: { Key?: string }) => {
    if (name === 'DeleteObjectCommand' && input.Key?.startsWith(`projects/${id}/`)) state.projects.set(id, { id } as never);
  });
  expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ deletedFiles: 1, skipped: 'active' });
  expect([...fake.objects.keys()].filter(key => key.startsWith(`uploads/projects/${id}/`))).toHaveLength(1);
  expect(fake.objects.has(marker(id))).toBe(false);
});
it('resumes after deleted pagination keys without skipping remaining objects', async () => {
  const { id } = await deletedFixture(); for (let i = 0; i < 205; i++) fake.objects.set(file(id), { date: new Date(0) });
  let cursor: string | undefined, deleted = 0, batches = 0;
  do { const result = await cleanupOriginalProjectFiles(id, cursor); deleted += result.deletedFiles; cursor = 'cursor' in result ? result.cursor : undefined; batches++; } while (cursor);
  expect(deleted).toBe(206); expect(batches).toBe(3); expect(fake.objects.has(marker(id))).toBe(false);
});
it('fails closed on incomplete inventory, storage errors, lost database configuration or invalid bucket', async () => {
  const { id, key } = await deletedFixture(); fake.calls.mockClear();
  fake.truncate = true; await expect(cleanupOriginalProjectFiles(id)).rejects.toThrow('Incomplete'); fake.truncate = false;
  for (const command of ['HeadObjectCommand', 'ListObjectsV2Command']) { fake.failures.add(command); await expect(cleanupOriginalProjectFiles(id)).rejects.toThrow('unavailable'); fake.failures.clear(); }
  vi.stubEnv('NODE_ENV', 'production'); await expect(cleanupOriginalProjectFiles(id)).rejects.toThrow('production database'); vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('CANVAS_BACKUP_BUCKET_NAME', 'uploads'); await expect(cleanupOriginalProjectFiles(id)).rejects.toThrow('different');
  expect(fake.objects.has(key)).toBe(true); expect(fake.calls.mock.calls.some(([name]) => name === 'DeleteObjectCommand')).toBe(false);
});
it('preserves unknown paths, stops on invalid metadata and rejects forged cursors', async () => {
  const { id, key } = await deletedFixture(); const unknown = `uploads/projects/${id}/nested/unknown`; fake.objects.set(unknown, { date: new Date(0) });
  await expect(cleanupOriginalProjectFiles(id, `projects/${randomUUID()}/file`)).rejects.toThrow('cursor');
  await expect(cleanupOriginalProjectFiles('../other-project')).rejects.toThrow('Invalid cleanup project');
  fake.objects.set(key, { date: new Date('invalid') }); await expect(cleanupOriginalProjectFiles(id)).rejects.toThrow('inventory');
  fake.objects.set(key, { date: new Date(0) }); await cleanupOriginalProjectFiles(id); expect(fake.objects.has(unknown)).toBe(true);
});
it('retries safely after deletion failure and clears an empty-prefix marker', async () => {
  const { id, key } = await deletedFixture(); fake.failures.add('DeleteObjectCommand');
  await expect(cleanupOriginalProjectFiles(id)).rejects.toThrow('unavailable'); expect(fake.objects.has(key)).toBe(true);
  fake.failures.clear(); expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ deletedFiles: 1 });
  fake.objects.set(marker(id), { date: new Date(0) }); await cleanupOriginalProjectFiles(id); expect(fake.objects.has(marker(id))).toBe(false);
});
it('enumerates historical prefixes and marker-only projects, and rejects incomplete root scans', async () => {
  const { id } = await deletedFixture(); const markerOnly = randomUUID(); fake.objects.set(marker(markerOnly), { date: new Date(0) });
  expect((await originalCleanupProjectPage()).projectIds).toContain(id); expect((await originalCleanupProjectPage(undefined, true)).projectIds).toContain(markerOnly);
  fake.truncate = true; await expect(originalCleanupProjectPage()).rejects.toThrow('Incomplete');
});
it('does nothing while the feature flag is disabled', async () => {
  vi.stubEnv('R2_PROJECT_CLEANUP_ENABLED', 'false'); expect(await cleanupOriginalProjectFiles(randomUUID())).toMatchObject({ skipped: 'disabled' }); expect(fake.calls).not.toHaveBeenCalled();
});
it('only sweeps after the owner deletion has committed; failed persistence leaves uploads protected', async () => {
  const owner = state.createUser({ username: 'original-owner', displayName: 'Owner', passwordHash: 'unused' }); owner.emailVerifiedAt = new Date();
  const editor = state.createUser({ username: 'original-editor', displayName: 'Editor', passwordHash: 'unused' }); editor.emailVerifiedAt = new Date();
  const workspace = [...state.workspaces.values()].find(item => item.createdByUserId === owner.id)!;
  state.memberships.set(state.memberKey(workspace.id, editor.id), { workspaceId: workspace.id, userId: editor.id, role: 'editor', joinedAt: new Date() });
  const id = randomUUID(), key = file(id); fake.objects.set(key, { date: new Date(0) });
  state.projects.set(id, { id, workspaceId: workspace.id, name: 'delete-test', description: '', layoutDirection: 'LR', createdByUserId: owner.id, createdAt: new Date() });
  const request = async (user: typeof owner) => DELETE(new NextRequest(`http://localhost/api/projects/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${(await createSession(user)).accessToken}` } }), { params: Promise.resolve({ path: ['projects', id] }) });
  expect((await request(editor)).status).toBe(403); expect(fake.objects.has(key)).toBe(true);
  const persist = vi.spyOn(state, 'persist').mockRejectedValueOnce(new Error('database offline'));
  expect((await request(owner)).status).toBe(503); persist.mockRestore();
  expect(state.projects.has(id)).toBe(true); expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ skipped: 'active' });
  expect((await request(owner)).status).toBe(200); expect(fake.objects.has(key)).toBe(true);
  expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ skipped: 'grace' }); advance(25);
  expect(await cleanupOriginalProjectFiles(id)).toMatchObject({ deletedFiles: 1 });
});
