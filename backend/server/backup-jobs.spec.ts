import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ capture: vi.fn(), prepare: vi.fn(), references: vi.fn(), finish: vi.fn(), page: vi.fn(), enabled: true, projects: new Map([['p', {}]]) }));
vi.mock('./inngest-client', () => ({ inngest: { createFunction: (_config: unknown, _trigger: unknown, handler: unknown) => handler } }));
vi.mock('./state', () => ({ state: { projects: mock.projects, runRequest: (fn: () => unknown) => fn() } }));
vi.mock('./canvas-backups', () => ({ canvasBackupEnabled: () => mock.enabled, canvasBackupRetentionEnabled: () => mock.enabled, captureCanvasBackup: mock.capture, prepareBackupCleanup: mock.prepare, backupReferences: mock.references, finishBackupCleanup: mock.finish, backupProjectPage: mock.page }));
import { canvasBackupFlush, canvasBackupCleanup, dailyCanvasBackupCleanup } from './inngest';

function context(data: Record<string, unknown> = { projectId: 'p' }) {
  return { event: { id: 'event', data }, step: { run: vi.fn(async (_name: string, fn: () => unknown) => fn()), sleepUntil: vi.fn().mockResolvedValue(undefined), sendEvent: vi.fn().mockResolvedValue(undefined) } };
}
type Context = ReturnType<typeof context>;
const run = (job: unknown, ctx: Context) => (job as (ctx: Context) => Promise<unknown>)(ctx);
beforeEach(() => {
  vi.clearAllMocks(); mock.enabled = true; mock.projects.set('p', {});
  mock.prepare.mockResolvedValue({ ids: [], more: false }); mock.finish.mockResolvedValue({ more: false });
  mock.references.mockResolvedValue(['canvas-backups/files/p/file']); mock.page.mockResolvedValue({ projectIds: [], cursor: null });
});
it('waits durably before reading the latest canvas, without requiring another edit', async () => {
  const dueAt = '2026-10-28T05:00:00.000Z'; const ctx = context({ projectId: 'p', dueAt });
  mock.capture.mockImplementation(() => { expect(ctx.step.sleepUntil).toHaveBeenCalledWith('wait-for-backup-interval', dueAt); return { id: 'backup' }; });
  expect(await run(canvasBackupFlush, ctx)).toEqual({ id: 'backup' });
  expect(mock.capture).toHaveBeenCalledWith('p', expect.objectContaining({ id: 'event' }));
});
it('skips deleted projects and disabled jobs, and rejects malformed events', async () => {
  mock.projects.delete('p'); await run(canvasBackupFlush, context({ projectId: 'p', dueAt: new Date().toISOString() }));
  expect(mock.capture).not.toHaveBeenCalled();
  await expect(run(canvasBackupFlush, context({ projectId: '../p', dueAt: 'bad' }))).rejects.toThrow();
  await expect(run(canvasBackupFlush, context({ projectId: 'p', dueAt: 'bad' }))).rejects.toThrow();
  mock.enabled = false;
  for (const job of [canvasBackupFlush, canvasBackupCleanup, dailyCanvasBackupCleanup]) expect(await run(job, context())).toEqual({ disabled: true });
});
it('reads immutable manifests in batches of five before the final locked reference check', async () => {
  const ids = Array.from({ length: 12 }, (_, i) => String(i)); mock.prepare.mockResolvedValue({ ids, more: false });
  await run(canvasBackupCleanup, context());
  expect(mock.references.mock.calls.map(call => call[1].length)).toEqual([5, 5, 2]);
  expect(mock.finish).toHaveBeenCalledWith('p', ids, Array(3).fill('canvas-backups/files/p/file'));
});
it('does not delete files if a retained manifest cannot be verified', async () => {
  mock.prepare.mockResolvedValue({ ids: ['bad'], more: false }); mock.references.mockRejectedValueOnce(new Error('corrupt'));
  await expect(run(canvasBackupCleanup, context())).rejects.toThrow('corrupt'); expect(mock.finish).not.toHaveBeenCalled();
});
it('continues bounded pruning and retries when a new capture invalidates a cleanup plan', async () => {
  mock.prepare.mockResolvedValueOnce({ ids: [], more: true }); const ctx = context();
  await run(canvasBackupCleanup, ctx); expect(mock.finish).not.toHaveBeenCalled(); expect(ctx.step.sendEvent).toHaveBeenCalledOnce();
  mock.finish.mockResolvedValueOnce({ more: true }); await run(canvasBackupCleanup, ctx); expect(ctx.step.sendEvent).toHaveBeenCalledTimes(2);
});
it('pages both manifests and file-only project prefixes, including projects missing from Neon', async () => {
  mock.page.mockResolvedValueOnce({ projectIds: ['deleted-project'], cursor: 'next' }).mockResolvedValueOnce({ projectIds: [], cursor: null }).mockResolvedValueOnce({ projectIds: ['file-only'], cursor: null });
  const ctx = context(); await run(dailyCanvasBackupCleanup, ctx);
  expect(mock.page.mock.calls).toEqual([[undefined, false], ['next', false], [undefined, true]]);
  expect(ctx.step.sendEvent).toHaveBeenCalledWith('queue-projects-2', [{ name: 'contextflow/canvas.backup-cleanup', data: { projectId: 'file-only' } }]);
});
