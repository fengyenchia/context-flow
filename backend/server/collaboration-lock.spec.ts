import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCollaborationLock } from './collaboration-lock';
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), end: vi.fn(), connected: vi.fn() }));
vi.mock('../src/db/client', () => ({ db: {} }));
vi.mock('@neondatabase/serverless', () => ({ Pool: class {
  connect() { mocks.connected(); return Promise.resolve({ query: mocks.query, release: mocks.release }); }
  end() { mocks.end(); return Promise.resolve(); }
} }));
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({}); vi.stubEnv('COLLABORATION_ENABLED', 'true'); });
afterEach(() => vi.unstubAllEnvs());
describe('cross-instance collaboration authorization fence', () => {
  it('locks before reading membership and releases only after permissions are committed', async () => {
    const action = vi.fn(async () => {
      expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('pg_advisory_xact_lock'));
      return 'authorized';
    });
    expect(await withCollaborationLock('projects/p/collaboration/auth', 'POST', action)).toBe('authorized');
    expect(mocks.query).toHaveBeenLastCalledWith('COMMIT');
    expect(mocks.release).toHaveBeenCalledTimes(1); expect(mocks.end).toHaveBeenCalledTimes(1);
  });
  it('rolls back and closes the request-scoped database connection on failure', async () => {
    await expect(withCollaborationLock('workspaces/w/members/u', 'DELETE', async () => { throw new Error('failure'); })).rejects.toThrow('failure');
    expect(mocks.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mocks.release).toHaveBeenCalledTimes(1); expect(mocks.end).toHaveBeenCalledTimes(1);
  });
  it('does not serialize ordinary canvas reads, edits or AI requests', async () => {
    for (const [route, method] of [['projects/p/canvas', 'GET'], ['ai/chat', 'POST']]) await withCollaborationLock(route, method, async () => 'ok');
    expect(mocks.connected).not.toHaveBeenCalled();
  });
  it('serializes invitation acceptance and revocation even when realtime is disabled', async () => {
    vi.stubEnv('COLLABORATION_ENABLED', 'false'); vi.stubEnv('PROJECT_INVITES_ENABLED', 'true');
    for (const [route, method] of [['project-invitations/accept', 'POST'], ['projects/p/invite-links/link', 'DELETE']]) await withCollaborationLock(route, method, async () => 'ok');
    expect(mocks.connected).toHaveBeenCalledTimes(2);
  });
});
