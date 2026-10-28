import { expect, it } from 'vitest';
import { withBackupLock } from './backup-lock';

it('serializes independent Neon connections and releases after rollback without writing tables', async () => {
  let active = 0;
  const events: string[] = [];
  const enter = (id: string) => async (assertHeld: () => Promise<void>) => {
    expect(active++).toBe(0);
    await assertHeld();
    events.push(`start-${id}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    events.push(`end-${id}`);
    active--;
  };
  await Promise.all([withBackupLock('retention-lock-test', enter('capture')), withBackupLock('retention-lock-test', enter('cleanup'))]);
  expect(events[1]).toBe(events[0].replace('start-', 'end-'));
  expect(events[3]).toBe(events[2].replace('start-', 'end-'));
  await expect(withBackupLock('retention-lock-test', async () => { throw new Error('intentional rollback'); })).rejects.toThrow('intentional rollback');
  await expect(withBackupLock('retention-lock-test', async assertHeld => { await assertHeld(); return 'released'; })).resolves.toBe('released');
});
