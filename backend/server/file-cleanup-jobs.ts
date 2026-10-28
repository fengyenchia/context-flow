import { inngest } from './inngest-client';
import { cleanupOriginalProjectFiles, originalCleanupProjectPage, originalFileCleanupEnabled } from './original-file-cleanup';

export const originalProjectFileCleanup = inngest.createFunction(
  { id: 'original-project-file-cleanup', retries: 5, concurrency: { limit: 1, key: 'event.data.projectId' } },
  { event: 'contextflow/files.cleanup-project' },
  async ({ event, step }) => {
    if (!originalFileCleanupEnabled()) return { disabled: true };
    const { projectId, cursor } = event.data;
    if (typeof projectId !== 'string' || (cursor !== undefined && typeof cursor !== 'string')) throw new Error('Invalid original cleanup event');
    const result = await step.run('clean-original-file-page', () => cleanupOriginalProjectFiles(projectId, cursor));
    if ('cursor' in result && result.cursor) await step.sendEvent('continue-original-files', { name: 'contextflow/files.cleanup-project', data: { projectId, cursor: result.cursor } });
    return result;
  },
);
export const dailyOriginalFileCleanup = inngest.createFunction(
  { id: 'daily-original-file-cleanup', retries: 5, concurrency: 1 },
  { cron: '47 3 * * *' },
  async ({ step }) => {
    if (!originalFileCleanupEnabled()) return { disabled: true };
    let page = 0;
    for (const markers of [false, true]) {
      let cursor: string | undefined;
      do {
        const batch = await step.run(`list-original-projects-${page}`, () => originalCleanupProjectPage(cursor, markers));
        if (batch.projectIds.length) await step.sendEvent(`queue-original-projects-${page}`, batch.projectIds.map(projectId => ({ name: 'contextflow/files.cleanup-project', data: { projectId } })));
        cursor = batch.cursor; page++;
      } while (cursor);
    }
    return { pages: page };
  },
);
