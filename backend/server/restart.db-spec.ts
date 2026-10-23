import { afterAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';
import { MemoryState } from './state';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

let createdUserId: string | undefined;
const imageData =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO4oxHwHwAFjAJU5cX1yAAAAABJRU5ErkJggg==';
afterAll(async () => {
  if (createdUserId) await db!.delete(users).where(eq(users.id, createdUserId));
});

it('restores persisted data in a separate OS process and rejects stale concurrent writes atomically', async () => {
  const first = new MemoryState();
  await first.hydrate();
  const user = first.createUser({
    username: `dbtest_${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'DB test',
    passwordHash: 'not-a-login-password',
  });
  createdUserId = user.id;
  const workspace = [...first.workspaces.values()].find(
    (item) => item.createdByUserId === user.id,
  )!;
  const projectId = crypto.randomUUID();
  first.projects.set(projectId, {
    id: projectId,
    workspaceId: workspace.id,
    createdByUserId: user.id,
    name: 'DB test',
    description: '',
    layoutDirection: 'LR',
    createdAt: new Date(),
  });
  const snapshot = {
    nodes: [
      {
        id: 'node-a',
        position: { x: -10, y: 20 },
        data: { nodeKind: 'text', nodeTitle: 'A', nodeContent: '完整內容' },
        style: { background: '#e8f5ee' },
      },
      { id: 'node-b', position: { x: 10, y: 50 }, data: { nodeTitle: 'B' } },
      {
        id: 'image-a',
        position: { x: 30, y: 80 },
        data: { nodeKind: 'image', imageUrl: imageData },
      },
    ],
    edges: [
      {
        id: 'edge',
        source: 'node-a',
        target: 'node-b',
        label: '包含',
        style: { stroke: '#d97887' },
      },
    ],
    convergenceNodes: [
      {
        id: 'converge-a',
        position: { x: 10, y: 20 },
        data: { nodeTitle: '結論' },
      },
      {
        id: 'converge-b',
        position: { x: 20, y: 80 },
        data: { nodeTitle: '下一步' },
      },
    ],
    convergenceEdges: [
      {
        id: 'converge-edge',
        source: 'converge-a',
        target: 'converge-b',
        label: '驗證',
        style: { stroke: '#d97887' },
      },
    ],
    resources: [{ id: 'source', kind: 'text', title: '來源', content: '內容' }],
    conversations: { general: ['第一句', '第二句'] },
    summary: 'First',
    updatedAt: new Date(),
  };
  first.canvasSnapshots.set(projectId, snapshot);
  const tokenId = crypto.randomUUID();
  first.emailVerifications.set(tokenId, {
    id: tokenId,
    userId: user.id,
    tokenHash: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
    expiresAt: new Date(Date.now() + 60_000),
  });
  await first.persist();
  // A separate Node/Vitest process must retrieve the committed bytes. Merely
  // constructing a second MemoryState would still share this process's modules.
  try {
    await promisify(execFile)(
      process.execPath,
      [
        resolve('node_modules/vitest/vitest.mjs'),
        'run',
        'server/restart-probe.db-spec.ts',
        '--config',
        'vitest.config.db.ts',
      ],
      {
        cwd: resolve('.'),
        windowsHide: true,
        timeout: 60_000,
        env: {
          ...process.env,
          DB_RESTART_PROBE: JSON.stringify({
            userId: user.id,
            projectId,
            tokenId,
            parentPid: process.pid,
          }),
        },
      },
    );
  } catch {
    throw new Error('獨立程序讀取測試失敗或逾時；未通過真正的重啟驗收');
  }
  const second = new MemoryState();
  await second.hydrate();
  expect(second.canvasSnapshots.get(projectId)).toMatchObject({
    ...snapshot,
    nodes: [
      {
        id: 'node-a',
        position: { x: -10, y: 20 },
        style: { background: '#e8f5ee' },
      },
      { id: 'node-b' },
      { id: 'image-a', data: { imageUrl: imageData } },
    ],
  });
  expect(second.emailVerifications.has(tokenId)).toBe(true);
  second.canvasSnapshots.get(projectId)!.summary = 'Second';
  second.canvasSnapshots.get(projectId)!.updatedAt = new Date(
    snapshot.updatedAt.getTime() + 1000,
  );
  await second.persist();
  first.canvasSnapshots.get(projectId)!.summary = 'Stale';
  await expect(first.persist()).rejects.toMatchObject({ status: 409 });
  const third = new MemoryState();
  await third.hydrate();
  expect(third.canvasSnapshots.get(projectId)?.summary).toBe('Second');
  // A foreign-key failure must also roll back an unrelated user update.
  third.users.get(user.id)!.displayName = 'Must roll back';
  const invalidId = crypto.randomUUID();
  third.projects.set(invalidId, {
    id: invalidId,
    workspaceId: crypto.randomUUID(),
    createdByUserId: user.id,
    name: 'Invalid FK',
    description: '',
    layoutDirection: 'LR',
    createdAt: new Date(),
  });
  await expect(third.persist()).rejects.toThrow();
  const fourth = new MemoryState();
  await fourth.hydrate();
  expect(fourth.users.get(user.id)?.displayName).toBe('DB test');
  expect(fourth.projects.has(invalidId)).toBe(false);
}, 180_000);
