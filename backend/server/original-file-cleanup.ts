import { DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { storage } from './files';
import { withBackupLock } from './backup-lock';
import { originalFileReferences } from './original-file-references';

export const originalFileCleanupEnabled = () => process.env.R2_PROJECT_CLEANUP_ENABLED === 'true';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const markerRoot = 'project-file-cleanup/v1/';
// Storage metadata may truncate milliseconds; retain one extra second.
const grace = 24 * 60 * 60 * 1000 + 1000;
const io = () => ({ abortSignal: AbortSignal.timeout(15_000) });
function target(projectId: string) {
  if (!uuid.test(projectId)) throw new Error('Invalid cleanup project');
  const result = storage();
  if (result.bucket === process.env.CANVAS_BACKUP_BUCKET_NAME) throw new Error('Upload and backup buckets must be different');
  return { ...result, prefix: `projects/${projectId}/`, marker: `${markerRoot}${projectId}.json` };
}
const notFound = (error: unknown) => Boolean(error && typeof error === 'object' && '$metadata' in error && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404);

/** Only exact upload paths belonging to a missing project are eligible.
 * A durable marker starts a grace period independently of object age. */
export async function cleanupOriginalProjectFiles(projectId: string, after?: string) {
  if (!originalFileCleanupEnabled()) return { deletedFiles: 0, skipped: 'disabled' };
  return withBackupLock(projectId, async assertHeld => {
    const { client, bucket, prefix, marker } = target(projectId);
    if (after && (!after.startsWith(prefix) || after.length > 1024)) throw new Error('Invalid cleanup cursor');
    const removeMarker = async () => { await assertHeld(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: marker }), io()); };
    if ((await originalFileReferences(projectId)).projectExists) { await removeMarker(); return { deletedFiles: 0, skipped: 'active' }; }
    let firstMissing: Date;
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: marker }), io());
      if (!head.LastModified || !Number.isFinite(head.LastModified.getTime())) throw new Error('Invalid cleanup marker');
      firstMissing = head.LastModified;
    } catch (error) {
      if (!notFound(error)) throw error;
      await assertHeld();
      try { await client.send(new PutObjectCommand({ Bucket: bucket, Key: marker, Body: JSON.stringify({ version: 1, projectId }), ContentType: 'application/json', IfNoneMatch: '*' }), io()); }
      catch (conflict) { if (!(conflict && typeof conflict === 'object' && '$metadata' in conflict && (conflict.$metadata as { httpStatusCode?: number }).httpStatusCode === 412)) throw conflict; }
      return { deletedFiles: 0, skipped: 'grace' };
    }
    if (firstMissing.getTime() > Date.now() - grace) return { deletedFiles: 0, skipped: 'grace' };
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, StartAfter: after, MaxKeys: 100 }), io());
    const objects = page.Contents || [];
    if (objects.length > 100 || objects.some(file => !file.Key?.startsWith(prefix) || !file.LastModified || !Number.isFinite(file.LastModified.getTime()))) throw new Error('Invalid original file inventory');
    const last = objects.at(-1)?.Key;
    if (objects.some((file, index) => (index > 0 && file.Key! <= objects[index - 1].Key!) || (after && file.Key! <= after))) throw new Error('Unordered original file inventory');
    if (page.IsTruncated && !last) throw new Error('Incomplete original file inventory');
    const candidates = objects.filter(file => uuid.test(file.Key!.slice(prefix.length)) && file.LastModified!.getTime() <= Date.now() - grace);
    // Check all document records, including records owned by a different project.
    const references = await originalFileReferences(projectId, candidates.map(file => file.Key!));
    if (references.projectExists) { await removeMarker(); return { deletedFiles: 0, skipped: 'active' }; }
    let deletedFiles = 0;
    for (const file of candidates) {
      if (references.protectedKeys.has(file.Key!)) continue;
      await assertHeld();
      // Recheck after slow IO and between deletes. Fail closed on Neon failure.
      const current = await originalFileReferences(projectId, [file.Key!]);
      if (current.projectExists) { await removeMarker(); return { deletedFiles, skipped: 'active' }; }
      if (current.protectedKeys.has(file.Key!)) continue;
      await assertHeld();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: file.Key! }), io()); deletedFiles++;
    }
    if (page.IsTruncated) return { deletedFiles, cursor: last };
    // Keep the marker if earlier pages or late uploads still contain objects.
    const remaining = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1 }), io());
    if (remaining.IsTruncated && !remaining.Contents?.length) throw new Error('Incomplete final original file inventory');
    if (!remaining.Contents?.length && !remaining.IsTruncated) await removeMarker();
    return { deletedFiles };
  });
}

/** Scan both historical upload prefixes and markers left by interrupted runs. */
export async function originalCleanupProjectPage(cursor?: string, markers = false) {
  const { client, bucket } = storage();
  if (bucket === process.env.CANVAS_BACKUP_BUCKET_NAME) throw new Error('Upload and backup buckets must be different');
  const root = markers ? markerRoot : 'projects/';
  const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: root, Delimiter: markers ? undefined : '/', MaxKeys: 100, ContinuationToken: cursor }), io());
  if (page.IsTruncated && !page.NextContinuationToken) throw new Error('Incomplete original project inventory');
  const ids = markers ? (page.Contents || []).map(file => file.Key?.endsWith('.json') ? file.Key.slice(root.length, -5) : '') : (page.CommonPrefixes || []).map(file => file.Prefix?.slice(root.length, -1) || '');
  return { projectIds: ids.filter((id): id is string => Boolean(id && uuid.test(id))), cursor: page.NextContinuationToken || undefined };
}
