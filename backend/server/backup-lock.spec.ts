import { beforeEach, expect, it, vi } from 'vitest';

const { query, release, end, connect } = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), end: vi.fn(), connect: vi.fn() }));
vi.mock('../src/db/client', () => ({ db: {} }));
vi.mock('@neondatabase/serverless', () => ({ Pool: class { connect = connect; end = end; } }));
import { withBackupLock } from './backup-lock';

beforeEach(() => { vi.clearAllMocks(); query.mockResolvedValue({}); end.mockResolvedValue(undefined); connect.mockResolvedValue({ query, release }); });
it('holds a transaction-scoped project lock, checks it before mutations and releases on commit', async () => {
  await withBackupLock('project-a', async assertHeld => { await assertHeld(); });
  expect(query.mock.calls.map(call => call[0])).toEqual(['BEGIN', "SET LOCAL lock_timeout = '10s'", "SET LOCAL idle_in_transaction_session_timeout = '60s'", "SELECT pg_advisory_xact_lock(hashtext('context-flow:canvas-backups'), hashtext($1))", 'SELECT 1', 'COMMIT']);
  expect(query.mock.calls[3][1]).toEqual(['project-a']);
  expect(release).toHaveBeenCalledOnce(); expect(end).toHaveBeenCalledOnce();
});
it('aborts publishing when the lock connection is lost, rolls back and closes the pool', async () => {
  query.mockImplementation(async (sql: string) => { if (sql === 'SELECT 1') throw new Error('lost lock'); });
  const publish = vi.fn();
  await expect(withBackupLock('a', async assertHeld => { await assertHeld(); publish(); })).rejects.toThrow('lost lock');
  expect(publish).not.toHaveBeenCalled(); expect(query).toHaveBeenCalledWith('ROLLBACK');
  expect(release).toHaveBeenCalledOnce(); expect(end).toHaveBeenCalledOnce();
});
it('closes a failed connection attempt', async () => {
  connect.mockRejectedValueOnce(new Error('unavailable'));
  await expect(withBackupLock('a', async () => undefined)).rejects.toThrow('unavailable');
  expect(end).toHaveBeenCalledOnce();
});
