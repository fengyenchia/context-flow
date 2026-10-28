import { Pool } from '@neondatabase/serverless';
import { db } from '../src/db/client';

const queues = new Map<string, Promise<void>>();
/** All backup publishers, cleaners and restores share this project lock. Use a
 * transaction lock so pooled Neon connections cannot move the lock to a stranger. */
export async function withBackupLock<T>(projectId: string, action: (assertHeld: () => Promise<void>) => Promise<T>): Promise<T> {
  if (!db) {
    if (process.env.NODE_ENV === 'production') throw new Error('Backup operations require the production database');
    const previous = queues.get(projectId) || Promise.resolve();
    let release!: () => void;
    const tail = previous.then(() => new Promise<void>(resolve => { release = resolve; }));
    queues.set(projectId, tail);
    await previous;
    try { return await action(async () => undefined); }
    finally { release(); if (queues.get(projectId) === tail) queues.delete(projectId); }
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('context-flow:canvas-backups'), hashtext($1))", [projectId]);
      const result = await action(async () => { await client.query('SELECT 1'); });
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  } finally { await pool.end(); }
}
