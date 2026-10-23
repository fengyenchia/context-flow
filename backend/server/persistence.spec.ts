import { describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { canvasEdges, canvasMessages, canvasNodes, canvasResources, canvasSummaries, projects, users, workspaces } from '../src/db/schema';
import { asDate } from './state';

describe('Neon normalized persistence', () => {
  it('normalizes timestamp values before Drizzle writes', () => {
    const value = asDate('2026-09-04T00:00:00.000Z');
    expect(value).toBeInstanceOf(Date);
    expect(value?.toISOString()).toBe('2026-09-04T00:00:00.000Z');
  });

  it.skipIf(!db)('exposes the normalized persistence tables', async () => {
    const [userRows, workspaceRows, projectRows, nodeRows, edgeRows, resourceRows, messageRows, summaryRows] = await Promise.all([
      db!.select({ id: users.id }).from(users), db!.select({ id: workspaces.id }).from(workspaces), db!.select({ id: projects.id }).from(projects),
      db!.select({ id: canvasNodes.id }).from(canvasNodes), db!.select({ id: canvasEdges.id }).from(canvasEdges), db!.select({ id: canvasResources.id }).from(canvasResources),
      db!.select({ id: canvasMessages.id }).from(canvasMessages), db!.select({ id: canvasSummaries.projectId }).from(canvasSummaries),
    ]);
    expect(userRows.length).toBeGreaterThanOrEqual(0); expect(workspaceRows.length).toBeGreaterThanOrEqual(0); expect(projectRows.length).toBeGreaterThanOrEqual(0);
    expect(nodeRows.length).toBeGreaterThanOrEqual(0); expect(edgeRows.length).toBeGreaterThanOrEqual(0); expect(resourceRows.length).toBeGreaterThanOrEqual(0); expect(messageRows.length).toBeGreaterThanOrEqual(0); expect(summaryRows.length).toBeGreaterThanOrEqual(0);
  });
});
