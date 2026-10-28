import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ enabled: true, clean: vi.fn(), page: vi.fn() }));
vi.mock('./inngest-client', () => ({ inngest: { createFunction: (_config: unknown, _trigger: unknown, handler: unknown) => handler } }));
vi.mock('./original-file-cleanup', () => ({ originalFileCleanupEnabled: () => mock.enabled, cleanupOriginalProjectFiles: mock.clean, originalCleanupProjectPage: mock.page }));
import { dailyOriginalFileCleanup, originalProjectFileCleanup } from './file-cleanup-jobs';
function context(data: Record<string, unknown> = { projectId: 'p' }) {
  return { event: { data }, step: { run: vi.fn(async (_id: string, fn: () => unknown) => fn()), sendEvent: vi.fn().mockResolvedValue(undefined) } };
}
const run = (job: unknown, ctx: ReturnType<typeof context>) => (job as (ctx: ReturnType<typeof context>) => Promise<unknown>)(ctx);
beforeEach(() => { vi.clearAllMocks(); mock.enabled = true; mock.clean.mockResolvedValue({ deletedFiles: 0 }); mock.page.mockResolvedValue({ projectIds: [], cursor: undefined }); });
it('skips disabled functions without accessing storage', async () => {
  mock.enabled = false;
  for (const job of [dailyOriginalFileCleanup, originalProjectFileCleanup]) expect(await run(job, context())).toEqual({ disabled: true });
  expect(mock.clean).not.toHaveBeenCalled(); expect(mock.page).not.toHaveBeenCalled();
});
it('continues the next lexicographic page after a bounded deletion batch', async () => {
  const ctx = context({ projectId: 'p', cursor: 'old' }); mock.clean.mockResolvedValue({ deletedFiles: 100, cursor: 'next' });
  await run(originalProjectFileCleanup, ctx);
  expect(mock.clean).toHaveBeenCalledWith('p', 'old');
  expect(ctx.step.sendEvent).toHaveBeenCalledWith('continue-original-files', { name: 'contextflow/files.cleanup-project', data: { projectId: 'p', cursor: 'next' } });
});
it('does not loop while a missing project is in its grace period', async () => {
  const ctx = context(); mock.clean.mockResolvedValue({ deletedFiles: 0, skipped: 'grace' }); await run(originalProjectFileCleanup, ctx); expect(ctx.step.sendEvent).not.toHaveBeenCalled();
});
it('propagates errors for retry and rejects malformed event data', async () => {
  mock.clean.mockRejectedValueOnce(new Error('storage unavailable')); const ctx = context();
  await expect(run(originalProjectFileCleanup, ctx)).rejects.toThrow('unavailable'); expect(ctx.step.sendEvent).not.toHaveBeenCalled();
  await expect(run(originalProjectFileCleanup, context({ projectId: 12 }))).rejects.toThrow('Invalid');
  await expect(run(originalProjectFileCleanup, context({ projectId: 'p', cursor: 12 }))).rejects.toThrow('Invalid');
});
it('pages both upload prefixes and durable grace markers to recover missed or interrupted deletions', async () => {
  mock.page.mockResolvedValueOnce({ projectIds: ['historical'], cursor: 'next' }).mockResolvedValueOnce({ projectIds: [], cursor: undefined }).mockResolvedValueOnce({ projectIds: ['marker-only'], cursor: undefined });
  const ctx = context(); expect(await run(dailyOriginalFileCleanup, ctx)).toEqual({ pages: 3 });
  expect(mock.page.mock.calls).toEqual([[undefined, false], ['next', false], [undefined, true]]);
  expect(ctx.step.sendEvent).toHaveBeenCalledWith('queue-original-projects-2', [{ name: 'contextflow/files.cleanup-project', data: { projectId: 'marker-only' } }]);
});
