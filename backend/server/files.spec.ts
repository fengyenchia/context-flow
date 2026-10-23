import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareUpload, completeUpload, downloadFile } from './files';
import { state } from './state';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async (original) => ({
  ...(await original<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = send;
  },
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => 'https://storage.example.test/signed'),
}));
let projectId: string;
let userId: string;
beforeEach(() => {
  for (const key of [
    'R2_ACCOUNT_ID',
    'R2_BUCKET_NAME',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ])
    vi.stubEnv(key, 'test-only');
  state.users.clear();
  state.workspaces.clear();
  state.memberships.clear();
  state.projects.clear();
  state.documents.clear();
  const user = state.createUser({
    username: 'files',
    displayName: 'Files',
    passwordHash: 'test',
  });
  userId = user.id;
  const workspace = [...state.workspaces.values()][0];
  projectId = crypto.randomUUID();
  state.projects.set(projectId, {
    id: projectId,
    workspaceId: workspace.id,
    createdByUserId: user.id,
    name: 'Files',
    description: '',
    layoutDirection: 'LR',
    createdAt: new Date(),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('reserves a file, verifies the uploaded size, and allows authenticated download', async () => {
  const upload = await prepareUpload(projectId, userId, {
    name: 'file.pdf',
    size: 1024,
    mimeType: 'application/pdf',
  });
  expect(state.documents.get(upload.id)?.status).toBe('pending');
  await expect(downloadFile(upload.id, userId)).rejects.toMatchObject({
    status: 404,
  });
  send.mockResolvedValue({ ContentLength: 1024 });
  expect(await completeUpload(upload.id, userId)).toMatchObject({
    url: `r2://${upload.id}`,
  });
  expect(state.documents.get(upload.id)?.status).toBe('ready');
  expect(await downloadFile(upload.id, userId)).toEqual({
    url: 'https://storage.example.test/signed',
  });
});

it('rejects partial uploads, oversized files and callers outside the workspace', async () => {
  await expect(
    prepareUpload(projectId, userId, { name: 'large', size: 21 * 1024 * 1024 }),
  ).rejects.toMatchObject({ status: 400 });
  const upload = await prepareUpload(projectId, userId, {
    name: 'small',
    size: 1024,
  });
  send.mockResolvedValue({ ContentLength: 128 });
  await expect(completeUpload(upload.id, userId)).rejects.toMatchObject({
    status: 400,
  });
  expect(state.documents.get(upload.id)?.status).toBe('pending');
  await expect(
    prepareUpload(projectId, 'outsider', { name: 'file', size: 1 }),
  ).rejects.toMatchObject({ status: 403 });
});
