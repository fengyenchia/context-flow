import { inngest } from './inngest-client';
export { inngest } from './inngest-client';
import { backupProjectPage, backupReferences, canvasBackupEnabled, canvasBackupRetentionEnabled, captureCanvasBackup, finishBackupCleanup, prepareBackupCleanup } from './canvas-backups';
import { state } from './state';

const enabled = () => canvasBackupEnabled() && canvasBackupRetentionEnabled();
function projectId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid backup project');
  return value;
}

export const canvasBackupFlush = inngest.createFunction(
  { id: 'canvas-backup-flush', retries: 5, concurrency: { limit: 1, key: 'event.data.projectId' } },
  { event: 'contextflow/canvas.backup-due' },
  async ({ event, step }) => {
    if (!enabled()) return { disabled: true };
    const id = projectId(event.data.projectId);
    const due = event.data.dueAt;
    if (typeof due !== 'string' || !Number.isFinite(Date.parse(due))) throw new Error('Invalid backup due time');
    await step.sleepUntil('wait-for-backup-interval', due);
    return step.run('capture-latest-cloud-canvas', () => state.runRequest(async () => {
      if (!enabled() || !state.projects.has(id)) return { skipped: true };
      return captureCanvasBackup(id, { id: event.id || `flush-${due}`, updatedAt: new Date().toISOString() });
    }));
  },
);

export const canvasBackupCleanup = inngest.createFunction(
  { id: 'canvas-backup-cleanup', retries: 5, concurrency: { limit: 1, key: 'event.data.projectId' } },
  { event: 'contextflow/canvas.backup-cleanup' },
  async ({ event, step }) => {
    if (!enabled()) return { disabled: true };
    const id = projectId(event.data.projectId);
    const plan = await step.run('prepare-bounded-batch', () => state.runRequest(() => prepareBackupCleanup(id)));
    let result: { more: boolean; deletedFiles?: number } = plan;
    if (!plan.more) {
      const references: string[] = [];
      for (let start = 0; start < plan.ids.length; start += 5) references.push(...await step.run(`references-${start}`, () => backupReferences(id, plan.ids.slice(start, start + 5))));
      result = await step.run('delete-unreferenced-copies', () => state.runRequest(() => finishBackupCleanup(id, plan.ids, references)));
    }
    if (result.more) await step.sendEvent('continue-cleanup', { name: 'contextflow/canvas.backup-cleanup', data: { projectId: id } });
    return result;
  },
);

export const dailyCanvasBackupCleanup = inngest.createFunction(
  { id: 'daily-canvas-backup-cleanup', retries: 5, concurrency: 1 },
  { cron: '17 3 * * *' },
  async ({ step }) => {
    if (!enabled()) return { disabled: true };
    let page = 0;
    // Also scan file-only prefixes: a prior run may have removed the last
    // manifest while a new orphan copy was still within its grace period.
    for (const files of [false, true]) {
      let cursor: string | undefined;
      do {
        const batch = await step.run(`list-projects-${page}`, () => backupProjectPage(cursor, files));
        if (batch.projectIds.length) await step.sendEvent(`queue-projects-${page}`, batch.projectIds.map(id => ({ name: 'contextflow/canvas.backup-cleanup', data: { projectId: id } })));
        cursor = batch.cursor || undefined; page++;
      } while (cursor);
    }
    return { pages: page };
  },
);
