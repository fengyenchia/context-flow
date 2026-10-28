import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import { documents, projects } from '../src/db/schema';
import { state } from './state';

/** Read Neon again inside the cleanup lock; a hydrated Map may be stale. */
export async function originalFileReferences(projectId: string, keys: string[] = []) {
  if (!db) {
    if (process.env.NODE_ENV === 'production') throw new Error('Original file cleanup requires the production database');
    return { projectExists: state.projects.has(projectId), protectedKeys: new Set([...state.documents.values()].filter(file => keys.includes(file.storageKey)).map(file => file.storageKey)) };
  }
  const project = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const files = keys.length ? await db.select({ key: documents.storageKey }).from(documents).where(inArray(documents.storageKey, keys)) : [];
  return { projectExists: project.length > 0, protectedKeys: new Set(files.map(file => file.key)) };
}
