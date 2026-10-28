import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { Liveblocks } from '@liveblocks/node';
import { Y, readSnapshot, type Snapshot } from '@context-flow/collaboration';
import { collaborationEnabled } from './collaboration';
import { storage } from './files';
import { ApiProblem, state, type Project } from './state';

const prefix = 'canvas-backups/v1/';
const maxBytes = 32 * 1024 * 1024;
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);
export const canvasBackupEnabled = () => process.env.CANVAS_BACKUP_ENABLED === 'true';

type DocumentRecord = Omit<NonNullable<ReturnType<typeof state.documents.get>>, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string; backupStorageKey: string };
type BackupPayload = { version: 1; project: Project; capturedAt: string; binary: string; documents: DocumentRecord[] };
type Backup = BackupPayload & { sha256: string };
export type BackupEntry = { id: string; capturedAt: string; sizeBytes: number };

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
export async function captureCanvasBackup(projectId: string, event?: { id: string; updatedAt: string }) {
  const { client, bucket } = backupStorage();
  const project = state.project(projectId);
  if (!process.env.LIVEBLOCKS_SECRET_KEY) throw new ApiProblem(503, '即時共編尚未設定');
  const binary = new Uint8Array(await new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY }).getYjsDocumentAsBinaryUpdate(`contextflow:project:${projectId}`));
  if (binary.length > maxBytes) throw new ApiProblem(413, '畫布超過備份大小限制，請聯絡管理員');
  const snapshot = decodeBinary(binary);
  const capturedAt = new Date().toISOString();
  const time = event ? Date.parse(event.updatedAt) : Date.now();
  if (!Number.isSafeInteger(time) || time < 0 || time >= 9_999_999_999_999) throw new ApiProblem(400, '備份時間不正確');
  const id = `${String(9_999_999_999_999 - time).padStart(13, '0')}-${digest(event?.id || randomUUID())}`;
  const documents: DocumentRecord[] = [];
  for (const item of state.documents.values()) {
    if (item.projectId !== projectId || item.status !== 'ready') continue;
    if (!validId(item.id) || item.storageKey !== `projects/${projectId}/${item.id}`) throw new ApiProblem(422, '檔案資料不正確');
    const backupStorageKey = `canvas-backups/files/${projectId}/${item.id}`;
    try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: backupStorageKey })); }
    catch (error) {
      if (!(error && typeof error === 'object' && '$metadata' in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404)) throw error;
      const original = storage();
      await client.send(new CopyObjectCommand({ Bucket: bucket, Key: backupStorageKey, CopySource: `${original.bucket}/${item.storageKey.split('/').map(encodeURIComponent).join('/')}` }));
    }
    documents.push({ ...item, backupStorageKey, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
  }
  const savedFiles = new Set(documents.map(item => `r2://${item.id}`));
  JSON.stringify(snapshot, (_key, value: unknown) => {
    if (typeof value === 'string' && value.startsWith('r2://') && !savedFiles.has(value)) throw new ApiProblem(422, '畫布包含找不到的上傳檔案，請先確認檔案資料');
    return value;
  });
  const payload: BackupPayload = { version: 1, project, capturedAt, binary: Buffer.from(binary).toString('base64'), documents };
  const backup: Backup = { ...payload, sha256: digest(JSON.stringify(payload)) };
  const json = Buffer.from(JSON.stringify(backup));
  if (json.length > maxBytes * 2) throw new ApiProblem(413, '備份資料超過大小限制');
  const body = gzipSync(json);
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: backupKey(projectId, id), Body: body, ContentType: 'application/gzip', IfNoneMatch: '*' }));
  } catch (error) {
    // Conditional creation makes webhook replay harmless across server instances.
    if (!(error && typeof error === 'object' && '$metadata' in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 412)) throw error;
  }
  return { id, capturedAt, sizeBytes: body.length };
}

export async function listCanvasBackups(projectId: string, cursor?: string) {
  const { client, bucket } = backupStorage();
  if (cursor && cursor.length > 4096) throw new ApiProblem(400, '分頁參數不正確');
  const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: projectPrefix(projectId), MaxKeys: 30, ContinuationToken: cursor }));
  return {
    backups: (result.Contents || []).filter(item => item.Key?.endsWith('.json.gz')).map(item => ({ id: item.Key!.slice(projectPrefix(projectId).length, -8), capturedAt: item.LastModified!.toISOString(), sizeBytes: item.Size || 0 })),
    cursor: result.NextContinuationToken || null,
  };
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
    if (backup.version !== 1 || backup.project.id !== projectId || !Array.isArray(backup.documents) || digest(JSON.stringify(payload)) !== sha256) throw new Error('Invalid backup');
    return { backup, snapshot: decodeBinary(binary) };
  } catch { throw new ApiProblem(422, '備份損壞或格式不支援，未進行還原'); }
}

/** Restore into a new project. Never apply old CRDT clocks to an active room. */
export async function restoreCanvasBackup(projectId: string, id: string, userId: string) {
  const source = state.project(projectId);
  state.requireRole(source.workspaceId, userId, ['owner', 'admin']);
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
}
