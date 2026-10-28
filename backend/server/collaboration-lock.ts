import { Pool } from '@neondatabase/serverless';
import { db } from '../src/db/client';

/** Serialize ACL grants and membership changes across Vercel instances. The
 * request-scoped transaction owns only the lock; existing persistence retains
 * its own atomic batches. Always close the WebSocket pool within this request. */
export async function withCollaborationLock<T>(route: string, method: string, action: () => Promise<T>): Promise<T> {
  const sensitive = /^(projects\/[^/]+\/collaboration\/auth|projects\/[^/]+\/invite-links(?:\/[^/]+)?|project-invitations\/accept|workspaces\/[^/]+\/members\/[^/]+|workspace-invitations\/[^/]+\/accept|admin\/users\/[^/]+\/(status|role))$/.test(route)
    || (method === 'DELETE' && /^projects\/[^/]+$/.test(route));
  if (!sensitive || !db || (process.env.COLLABORATION_ENABLED !== 'true' && process.env.PROJECT_INVITES_ENABLED !== 'true')) return action();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '45s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('context-flow:collaboration-permissions'))");
      const result = await action();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}
