import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users, workspaces, projects, documents } from '../src/db/schema';
import { state } from './state';
import { originalFileReferences } from './original-file-references';

it('uses current Neon project and cross-project document references despite stale in-memory state', async () => {
  const ownerId = randomUUID(), workspaceId = randomUUID(), projectId = randomUUID(), deletedId = randomUUID(), documentId = randomUUID();
  const key = `projects/${deletedId}/${documentId}`;
  try {
    await db!.insert(users).values({ id: ownerId, username: `cleanup-${ownerId.slice(0, 12)}`, displayName: 'Cleanup test', passwordHash: 'fixture' });
    await db!.insert(workspaces).values({ id: workspaceId, name: 'Cleanup fixture', kind: 'personal', createdByUserId: ownerId });
    await db!.insert(projects).values({ id: projectId, workspaceId, name: 'Retained fixture', createdByUserId: ownerId });
    await db!.insert(documents).values({ id: documentId, projectId, originalName: 'fixture.txt', storageKey: key, sizeBytes: 1, mimeType: 'text/plain', status: 'ready', uploadedByUserId: ownerId });
    state.projects.delete(projectId); state.projects.set(deletedId, { id: deletedId } as never);
    expect((await originalFileReferences(projectId)).projectExists).toBe(true);
    expect(await originalFileReferences(deletedId, [key])).toEqual({ projectExists: false, protectedKeys: new Set([key]) });
    await db!.delete(projects).where(eq(projects.id, projectId));
    expect(await originalFileReferences(projectId, [key])).toEqual({ projectExists: false, protectedKeys: new Set() });
  } finally {
    state.projects.delete(deletedId);
    await db!.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db!.delete(users).where(eq(users.id, ownerId));
  }
});
