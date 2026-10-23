import { expect, it } from 'vitest';
import { enforceAuthRate } from './rate-limit';

it('limits repeated auth attempts and permits requests after the window expires', () => {
  const address = crypto.randomUUID();
  for (let i = 0; i < 30; i++) enforceAuthRate('auth/login', address, 1000);
  expect(() => enforceAuthRate('auth/login', address, 1001)).toThrow(
    '操作次數過多',
  );
  expect(() =>
    enforceAuthRate('auth/login', address, 1000 + 15 * 60_000),
  ).not.toThrow();
  expect(() =>
    enforceAuthRate('projects/example/canvas', address, 1001),
  ).not.toThrow();
});
