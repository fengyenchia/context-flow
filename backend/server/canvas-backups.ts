import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, type _Object } from '@aws-sdk/client-s3';
import { Liveblocks } from '@liveblocks/node';
import { Y, readSnapshot, type Snapshot } from '@context-flow/collaboration';
import { collaborationEnabled } from './collaboration';
import { storage } from './files';
import { ApiProblem, state, type Project } from './state';
import { withBackupLock } from './backup-lock';
import { inngest } from './inngest-client';

const prefix = 'canvas-backups/v1/';
const maxBytes = 32 * 1024 * 1024;
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);
export const canvasBackupEnabled = () => process.env.CANVAS_BACKUP_ENABLED === 'true';
export const canvasBackupRetentionEnabled = () => process.env.CANVAS_BACKUP_RETENTION_ENABLED === 'true';
export const backupPolicy = { maxVersions: 50, maxAgeDays: 30, autoIntervalMinutes: 15 } as const;
const maxAge = backupPolicy.maxAgeDays * 86400_000;
const autoInterval = backupPolicy.autoIntervalMinutes * 60_000;
const fileGrace = 86400_000;
const manifestId = /^\d{13}-[a-f0-9]{64}$/;

type DocumentRecord = Omit<NonNullable<ReturnType<typeof state.documents.get>>, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string; backupStorageKey: string };
type BackupPayload = { version: 1; project: Project; capturedAt: string; binary: string; documents: DocumentRecord[]; contentHash?: string };
type Backup = BackupPayload & { sha256: string };
export type BackupEntry = { id: string; capturedAt: string; sizeBytes: number };
export type CaptureResult = BackupEntry & { skipped?: 'unchanged' | 'scheduled'; nextBackupAt?: string };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function logicalHash(project: Project, snapshot: Snapshot, documents: Array<Omit<DocumentRecord, 'backupStorageKey'>>) {
  return digest(canonical({ project: { id: project.id, name: project.name, description: project.description, layoutDirection: project.layoutDirection }, snapshot, documents: [...documents].sort((a, b) => a.id.localeCompare(b.id)).map(item => ({ id: item.id, originalName: item.originalName, mimeType: item.mimeType, sizeBytes: item.sizeBytes, storageKey: item.storageKey })) }));
}
function fileIds(snapshot: Snapshot) {
  const ids = new Set<string>();
  JSON.stringify(snapshot, (_key, value: unknown) => {
    if (typeof value === 'string' && value.startsWith('r2://')) {
      const id = value.slice(5);
      if (!validId(id)) throw new ApiProblem(422, '畫布檔案參照不正確');
      ids.add(id);
    }
    return value;
  });
  return ids;
}
async function protectLiveFiles(projectId: string, referenced: Set<string>) {
  if (!state.projects.has(projectId)) return;
  if (!process.env.LIVEBLOCKS_SECRET_KEY) throw new Error('Cannot verify live file references');
  const binary = await new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY }).getYjsDocumentAsBinaryUpdate(`contextflow:project:${projectId}`);
  for (const id of fileIds(decodeBinary(new Uint8Array(binary)))) referenced.add(`canvas-backups/files/${projectId}/${id}`);
}
async function allObjects(objectPrefix: string) {
  const { client, bucket } = backupStorage(); const objects: _Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: objectPrefix, MaxKeys: 1000, ContinuationToken: cursor }));
    objects.push(...(page.Contents || [])); cursor = page.NextContinuationToken;
    if (page.IsTruncated && !cursor) throw new Error('Incomplete backup inventory');
  } while (cursor);
  return objects;
}
function entry(object: _Object, projectId: string): BackupEntry {
  const id = object.Key?.slice(projectPrefix(projectId).length, -8) || '';
  if (!object.Key?.endsWith('.json.gz') || !manifestId.test(id) || !object.LastModified || !Number.isFinite(object.LastModified.getTime())) throw new Error('Unrecognized backup manifest');
  return { id, capturedAt: object.LastModified.toISOString(), sizeBytes: object.Size || 0 };
}
async function inventory(projectId: string) {
  return (await allObjects(projectPrefix(projectId))).map(object => entry(object, projectId)).sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || a.id.localeCompare(b.id));
}
async function scheduleFlush(projectId: string, dueAt: string) {
  if (!process.env.INNGEST_EVENT_KEY || !process.env.INNGEST_SIGNING_KEY) throw new ApiProblem(503, '備份排程尚未設定，請完成 Inngest 設定');
  await inngest.send({ id: `canvas-backup:${projectId}:${dueAt}`, name: 'contextflow/canvas.backup-due', data: { projectId, dueAt } });
}

function backupStorage() {
  if (!canvasBackupEnabled() || !collaborationEnabled()) throw new ApiProblem(503, '畫布備份尚未啟用');
  const bucket = process.env.CANVAS_BACKUP_BUCKET_NAME;
  if (!bucket || bucket === process.env.R2_BUCKET_NAME) throw new ApiProblem(503, '請設定獨立的私人畫布備份儲存空間');
  return storage(bucket);
}
function projectPrefix(projectId: string) {
  if (!validId(projectId)) throw new ApiProblem(400, '專案識別碼不正確');
  return `${prefix}${projectId}/`;
}
function backupKey(projectId: string, id: string) {
  if (!/^\d{13}-[a-f0-9]{64}$/.test(id)) throw new ApiProblem(400, '備份識別碼不正確');
  return `${projectPrefix(projectId)}${id}.json.gz`;
}
function decodeBinary(binary: Uint8Array): Snapshot {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, binary);
    if (doc.getMap('meta').get('schema') !== 1) throw new Error('Unsupported schema');
    return readSnapshot(doc);
  } finally { doc.destroy(); }
}

/** eventTime/id are signed by Liveblocks. Retries use an immutable, identical key.
 * Every invocation fetches cloud data; delayed webhooks never replay old payloads. */
export async function captureCanvasBackup(projectId: string, event?: { id: string; updatedAt: string }): Promise<CaptureResult> {
  return withBackupLock(projectId, async assertHeld => {
  const { client, bucket } = backupStorage();
  const project = state.project(projectId);
  if (!process.env.LIVEBLOCKS_SECRET_KEY) throw new ApiProblem(503, '即時共編尚未設定');
  const binary = new Uint8Array(await new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY }).getYjsDocumentAsBinaryUpdate(`contextflow:project:${projectId}`));
  if (binary.length > maxBytes) throw new ApiProblem(413, '畫布超過備份大小限制，請聯絡管理員');
  const snapshot = decodeBinary(binary);
  const usedFiles = fileIds(snapshot);
  const sourceDocuments = [...state.documents.values()].filter(item => usedFiles.has(item.id) && item.projectId === projectId && item.status === 'ready').map(item => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
  const contentHash = logicalHash(project, snapshot, sourceDocuments);
  if (canvasBackupRetentionEnabled()) {
    const latest = (await inventory(projectId))[0];
    if (latest && Date.parse(latest.capturedAt) >= Date.now() - maxAge) {
      const { backup, snapshot: previous } = await loadBackup(projectId, latest.id);
      const oldDocuments = backup.documents.map(({ backupStorageKey: _key, ...document }) => document);
      if (logicalHash(backup.project, previous, oldDocuments) === contentHash) {
        await cleanupUnlocked(projectId, assertHeld, false);
        return { ...latest, skipped: 'unchanged' };
      }
      // R2 LastModified may round to whole seconds; use the manifest's exact
      // capture time so automatic writes never shorten the 15 minute interval.
      const due = Date.parse(backup.capturedAt) + autoInterval;
      if (event && due > Date.now()) {
        const nextBackupAt = new Date(due).toISOString();
        await scheduleFlush(projectId, nextBackupAt);
        await cleanupUnlocked(projectId, assertHeld, false);
        return { ...latest, skipped: 'scheduled', nextBackupAt };
      }
    }
  }
  const capturedAt = new Date().toISOString();
  const time = !canvasBackupRetentionEnabled() && event ? Date.parse(event.updatedAt) : Date.now();
  if (!Number.isSafeInteger(time) || time < 0 || time >= 9_999_999_999_999) throw new ApiProblem(400, '備份時間不正確');
  const id = `${String(9_999_999_999_999 - time).padStart(13, '0')}-${digest(event?.id || randomUUID())}`;
  const documents: DocumentRecord[] = [];
  for (const item of state.documents.values()) {
    if (!usedFiles.has(item.id) || item.projectId !== projectId || item.status !== 'ready') continue;
    if (!validId(item.id) || item.storageKey !== `projects/${projectId}/${item.id}`) throw new ApiProblem(422, '檔案資料不正確');
    const backupStorageKey = `canvas-backups/files/${projectId}/${item.id}`;
    try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: backupStorageKey })); }
    catch (error) {
      if (!(error && typeof error === 'object' && '$metadata' in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404)) throw error;
      const original = storage();
      await assertHeld();
      await client.send(new CopyObjectCommand({ Bucket: bucket, Key: backupStorageKey, CopySource: `${original.bucket}/${item.storageKey.split('/').map(encodeURIComponent).join('/')}` }));
    }
    documents.push({ ...item, backupStorageKey, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  }
  const savedFiles = new Set(documents.map(item => `r2://${item.id}`));
  JSON.stringify(snapshot, (_key, value: unknown) => {
    if (typeof value === 'string' && value.startsWith('r2://') && !savedFiles.has(value)) throw new ApiProblem(422, '畫布包含找不到的上傳檔案，請先確認檔案資料');
    return value;
  });
  const payload: BackupPayload = { version: 1, project, capturedAt, binary: Buffer.from(binary).toString('base64'), documents, ...(canvasBackupRetentionEnabled() ? { contentHash } : {}) };
  const backup: Backup = { ...payload, sha256: digest(JSON.stringify(payload)) };
  const json = Buffer.from(JSON.stringify(backup));
  if (json.length > maxBytes * 2) throw new ApiProblem(413, '備份資料超過大小限制');
  const body = gzipSync(json);
  await assertHeld();
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: backupKey(projectId, id), Body: body, ContentType: 'application/gzip', IfNoneMatch: '*' }));
  } catch (error) {
    // Conditional creation makes webhook replay harmless across server instances.
    if (!(error && typeof error === 'object' && '$metadata' in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 412)) throw error;
  }
  if (canvasBackupRetentionEnabled()) await cleanupUnlocked(projectId, assertHeld, false);
  return { id, capturedAt, sizeBytes: body.length };
  });
}

export async function listCanvasBackups(projectId: string, cursor?: string) {
  return withBackupLock(projectId, async assertHeld => {
  if (canvasBackupRetentionEnabled()) await cleanupUnlocked(projectId, assertHeld, false);
  const { client, bucket } = backupStorage();
  if (cursor && cursor.length > 4096) throw new ApiProblem(400, '分頁參數不正確');
  const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: projectPrefix(projectId), MaxKeys: 30, ContinuationToken: cursor }));
  return {
    backups: (result.Contents || []).filter(item => item.Key?.endsWith('.json.gz')).map(item => ({ id: item.Key!.slice(projectPrefix(projectId).length, -8), capturedAt: item.LastModified!.toISOString(), sizeBytes: item.Size || 0 })),
    cursor: result.NextContinuationToken || null,
    ...(canvasBackupRetentionEnabled() ? { policy: backupPolicy } : {}),
  };
  });
}

async function loadBackup(projectId: string, id: string) {
  const { client, bucket } = backupStorage();
  let object;
  try { object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: backupKey(projectId, id) })); }
  catch (error) {
    if (error && typeof error === 'object' && '$metadata' in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404) throw new ApiProblem(404, '找不到備份');
    throw error;
  }
  if (!object.Body || (object.ContentLength || 0) > maxBytes * 2) throw new ApiProblem(422, '備份格式不正確');
  const compressed = await object.Body.transformToByteArray();
  if (compressed.length > maxBytes * 2) throw new ApiProblem(422, '備份格式不正確');
  try {
    const backup = JSON.parse(gunzipSync(compressed, { maxOutputLength: maxBytes * 2 }).toString('utf8')) as Backup;
    const binary = Buffer.from(backup.binary, 'base64');
    const { sha256, ...payload } = backup;
    if (backup.version !== 1 || backup.project.id !== projectId || !Number.isFinite(Date.parse(backup.capturedAt)) || !Array.isArray(backup.documents) || digest(JSON.stringify(payload)) !== sha256) throw new Error('Invalid backup');
    const snapshot = decodeBinary(binary);
    const documents = new Set(backup.documents.map(item => item.id));
    if ([...fileIds(snapshot)].some(id => !documents.has(id))) throw new Error('Incomplete attachment manifest');
    return { backup, snapshot };
  } catch { throw new ApiProblem(422, '備份損壞或格式不支援，未進行還原'); }
}

/** Restore into a new project. Never apply old CRDT clocks to an active room. */
export async function restoreCanvasBackup(projectId: string, id: string, userId: string) {
  return withBackupLock(projectId, async assertHeld => {
  const source = state.project(projectId);
  state.requireRole(source.workspaceId, userId, ['owner', 'admin']);
  if (canvasBackupRetentionEnabled()) {
    const allowed = (await inventory(projectId)).filter(item => Date.parse(item.capturedAt) >= Date.now() - maxAge).slice(0, backupPolicy.maxVersions);
    if (!allowed.some(item => item.id === id)) throw new ApiProblem(404, '此備份已超過保留範圍，請重新整理清單');
  }
  const { backup, snapshot } = await loadBackup(projectId, id);
  if (backup.project.workspaceId !== source.workspaceId) throw new ApiProblem(422, '備份工作區不符');
  const project: Project = { ...source, id: randomUUID(), createdByUserId: userId, name: `${backup.project.name.slice(0, 220)}（備份還原）`, description: backup.project.description, layoutDirection: backup.project.layoutDirection, createdAt: new Date() };
  const ids = new Map<string, string>();
  const documents = [];
  // Validate all metadata before any copy. Restrict source paths to this project.
  for (const item of backup.documents) {
    if (!validId(item.id) || item.projectId !== projectId || item.storageKey !== `projects/${projectId}/${item.id}` || item.backupStorageKey !== `canvas-backups/files/${projectId}/${item.id}` || item.status !== 'ready') throw new ApiProblem(422, '備份檔案資料不正確');
  }
  for (const item of backup.documents) {
    const { client, bucket } = storage();
    const documentId = randomUUID(); const storageKey = `projects/${project.id}/${documentId}`;
    await assertHeld();
    await client.send(new CopyObjectCommand({ Bucket: bucket, Key: storageKey, CopySource: `${process.env.CANVAS_BACKUP_BUCKET_NAME}/${item.backupStorageKey.split('/').map(encodeURIComponent).join('/')}` }));
    ids.set(`r2://${item.id}`, `r2://${documentId}`);
    const { backupStorageKey: _backupKey, ...record } = item;
    documents.push({ ...record, id: documentId, projectId: project.id, storageKey, uploadedByUserId: userId, createdAt: new Date(item.createdAt), updatedAt: new Date() });
  }
  // Replace exact file references, including references nested in node data.
  const restored = JSON.parse(JSON.stringify(snapshot), (_key, value: unknown) => typeof value === 'string' ? ids.get(value) || value : value) as Snapshot;
  state.projects.set(project.id, project);
  state.canvasSnapshots.set(project.id, { ...restored, updatedAt: new Date() });
  for (const document of documents) state.documents.set(document.id, document);
  return project;
  });
}

/** Only delete from the private backup bucket after a complete, validated scan.
 * A partial scan, unknown object, corrupt manifest or deletion failure stops GC. */
async function cleanupUnlocked(projectId: string, assertHeld: () => Promise<void>, collectFiles = true) {
  if (!canvasBackupRetentionEnabled()) return { deletedVersions: 0, deletedFiles: 0, more: false };
  const { client, bucket } = backupStorage(); const now = Date.now();
  const versions = await inventory(projectId);
  const keep = versions.filter(item => Date.parse(item.capturedAt) >= now - maxAge).slice(0, backupPolicy.maxVersions);
  const keptIds = new Set(keep.map(item => item.id));
  const remove = versions.filter(item => !keptIds.has(item.id));
  const referenced = new Set(collectFiles ? await backupReferences(projectId, keep.map(item => item.id)) : []);
  if (collectFiles) await protectLiveFiles(projectId, referenced);
  let deletedVersions = 0, deletedFiles = 0;
  for (const item of remove.slice(0, 100)) {
    await assertHeld(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: backupKey(projectId, item.id) })); deletedVersions++;
  }
  if (remove.length > deletedVersions) return { deletedVersions, deletedFiles, more: true };
  if (!collectFiles) return { deletedVersions, deletedFiles, more: false };
  const remaining = await inventory(projectId);
  if (remaining.length !== keep.length || remaining.some(item => !keptIds.has(item.id))) throw new Error('Backup inventory changed during cleanup');
  const filePrefix = `canvas-backups/files/${projectId}/`;
  const files = await allObjects(filePrefix);
  const unused = files.filter(item => item.Key && validId(item.Key.slice(filePrefix.length)) && !referenced.has(item.Key) && item.LastModified && item.LastModified.getTime() < now - fileGrace);
  for (const item of unused.slice(0, 100)) {
    await assertHeld(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key! })); deletedFiles++;
  }
  return { deletedVersions, deletedFiles, more: unused.length > deletedFiles };
}

export const cleanupCanvasBackups = (projectId: string) => withBackupLock(projectId, assertHeld => cleanupUnlocked(projectId, assertHeld));

/** Durable cleanup reads at most five large documents per step. Only UUID paths,
 * not document bodies, enter the scheduler's saved step results. */
export async function backupReferences(projectId: string, ids: string[]) {
  const referenced = new Set<string>();
  for (const id of ids) {
    const { backup } = await loadBackup(projectId, id);
    for (const document of backup.documents) {
      const expected = `canvas-backups/files/${projectId}/${document.id}`;
      if (!validId(document.id) || document.projectId !== projectId || document.backupStorageKey !== expected || document.storageKey !== `projects/${projectId}/${document.id}` || document.status !== 'ready') throw new Error('Invalid backup file reference');
      referenced.add(expected);
    }
  }
  return [...referenced];
}
export async function prepareBackupCleanup(projectId: string) {
  return withBackupLock(projectId, async assertHeld => {
    const result = await cleanupUnlocked(projectId, assertHeld, false);
    return { ...result, ids: result.more ? [] : (await inventory(projectId)).map(item => item.id) };
  });
}
export async function finishBackupCleanup(projectId: string, ids: string[], references: string[]) {
  return withBackupLock(projectId, async assertHeld => {
    if (!canvasBackupRetentionEnabled()) return { deletedFiles: 0, more: false };
    const current = (await inventory(projectId)).map(item => item.id);
    if (canonical(current) !== canonical(ids)) return { deletedFiles: 0, more: true };
    const filePrefix = `canvas-backups/files/${projectId}/`;
    if (references.some(key => !key.startsWith(filePrefix) || !validId(key.slice(filePrefix.length)))) throw new Error('Invalid cleanup reference');
    const referenced = new Set(references);
    await protectLiveFiles(projectId, referenced);
    const unused = (await allObjects(filePrefix)).filter(item => item.Key && validId(item.Key.slice(filePrefix.length)) && !referenced.has(item.Key) && item.LastModified && item.LastModified.getTime() < Date.now() - fileGrace);
    let deletedFiles = 0;
    for (const file of unused.slice(0, 100)) { await assertHeld(); await clientDelete(file.Key!); deletedFiles++; }
    return { deletedFiles, more: unused.length > deletedFiles };
  });
}
async function clientDelete(key: string) {
  const { client, bucket } = backupStorage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function backupProjectPage(cursor?: string, files = false) {
  const { client, bucket } = backupStorage();
  const root = files ? 'canvas-backups/files/' : prefix;
  const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: root, Delimiter: '/', MaxKeys: 100, ContinuationToken: cursor }));
  if (page.IsTruncated && !page.NextContinuationToken) throw new Error('Incomplete project inventory');
  return { projectIds: (page.CommonPrefixes || []).map(item => item.Prefix?.slice(root.length, -1) || '').filter(validId), cursor: page.NextContinuationToken || null };
}
