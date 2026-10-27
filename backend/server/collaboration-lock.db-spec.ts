import { afterEach, expect, it, vi } from 'vitest';
import { withCollaborationLock } from './collaboration-lock';

afterEach(() => vi.unstubAllEnvs());
it('serializes independent Neon connections without modifying any table or application data', async () => {
  vi.stubEnv('COLLABORATION_ENABLED', 'true');
  let active = 0;
  const events: string[] = [];
  const enter = (id: string) => async () => {
    expect(active++).toBe(0);
    events.push(`start-${id}`);
    await new Promise(resolve => setTimeout(resolve, 200));
    events.push(`end-${id}`);
    active--;
  };
  await Promise.all([
    withCollaborationLock('projects/a/collaboration/auth', 'POST', enter('auth')),
    withCollaborationLock('workspaces/w/members/u', 'DELETE', enter('revoke')),
  ]);
  expect(events).toHaveLength(4);
  expect(events[1]).toBe(events[0].replace('start-', 'end-'));
  expect(events[3]).toBe(events[2].replace('start-', 'end-'));
});
