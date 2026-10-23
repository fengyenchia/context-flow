import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ApiProblem, state } from './state';

function storage() {
  const {
    R2_ACCOUNT_ID,
    R2_BUCKET_NAME,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
  } = process.env;
  if (
    !R2_ACCOUNT_ID ||
    !R2_BUCKET_NAME ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY
  )
    throw new ApiProblem(503, '檔案儲存尚未設定，請先完成 R2 設定');
  return {
    bucket: R2_BUCKET_NAME,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    }),
  };
}

export async function prepareUpload(
  projectId: string,
  userId: string,
  input: Record<string, unknown>,
) {
  const project = state.project(projectId);
  state.requireRole(project.workspaceId, userId, ['owner', 'admin', 'editor']);
  const name =
    typeof input.name === 'string' ? input.name.trim().slice(0, 255) : '';
  const size = Number(input.size);
  const mime =
    typeof input.mimeType === 'string'
      ? input.mimeType.slice(0, 100)
      : 'application/octet-stream';
  if (
    !name ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > 20 * 1024 * 1024
  )
    throw new ApiProblem(400, '請選擇 20 MB 以內的非空白檔案');
  const { client, bucket } = storage();
  const id = randomUUID();
  const key = `projects/${projectId}/${id}`;
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mime,
      ContentLength: size,
    }),
    { expiresIn: 600 },
  );
  state.documents.set(id, {
    id,
    projectId,
    uploadedByUserId: userId,
    originalName: name,
    mimeType: mime,
    storageKey: key,
    sizeBytes: size,
    status: 'pending',
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id, uploadUrl, mimeType: mime };
}

export async function completeUpload(id: string, userId: string) {
  const document = state.documents.get(id);
  if (!document) throw new ApiProblem(404, '找不到檔案');
  const project = state.project(document.projectId);
  state.requireRole(project.workspaceId, userId, ['owner', 'admin', 'editor']);
  const { client, bucket } = storage();
  const object = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: document.storageKey }),
  );
  if (object.ContentLength !== document.sizeBytes)
    throw new ApiProblem(400, '檔案尚未完整上傳，請重新選擇檔案');
  document.status = 'ready';
  document.updatedAt = new Date();
  return {
    id,
    title: document.originalName,
    size: document.sizeBytes,
    mimeType: document.mimeType,
    url: `r2://${id}`,
  };
}

export async function downloadFile(id: string, userId: string) {
  const document = state.documents.get(id);
  if (!document || document.status !== 'ready')
    throw new ApiProblem(404, '找不到已完成上傳的檔案');
  const project = state.project(document.projectId);
  state.requireRole(project.workspaceId, userId, [
    'owner',
    'admin',
    'editor',
    'viewer',
  ]);
  const { client, bucket } = storage();
  return {
    url: await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: document.storageKey,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
      }),
      { expiresIn: 180 },
    ),
  };
}
