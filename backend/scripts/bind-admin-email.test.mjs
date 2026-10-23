import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { bindAdminEmail, bindingFailure, hiddenInput, normalizeEmail } from './bind-admin-email.mjs';

test('normalizes valid Email and rejects invalid inputs without echoing values', () => {
  assert.equal(normalizeEmail(' Person@Example.test '), 'person@example.test');
  for (const value of ['', 'invalid', 'a\nb@example.test', 'x'.repeat(321) + '@example.test']) {
    assert.throws(() => normalizeEmail(value), { message: 'Email 格式不正確；未修改資料。' });
  }
});

test('uses bound parameters and one serializable transaction; preserves verification gate', async () => {
  let query, parameters, options;
  const sql = {
    query(text, values) { query = text; parameters = values; return 'query'; },
    async transaction(queries, opts) { assert.deepEqual(queries, ['query']); options = opts; return [[{ changed: 1 }]]; },
  };
  await bindAdminEmail(sql, 'Person@Example.test');
  assert.deepEqual(parameters, ['person@example.test']);
  assert.equal(query.includes(parameters[0]), false);
  assert.deepEqual(options, { isolationLevel: 'Serializable' });
  for (const check of ["username = 'admin'", "role = 'admin'", "status = 'active'", 'email IS NULL', 'NOT EXISTS', 'email_verified_at = NULL', 'token_version = token_version + 1', 'public.refresh_sessions', 'public.password_reset_tokens', 'public.email_verification_tokens']) assert.ok(query.includes(check));
  assert.equal(query.includes('password_hash'), false);
});

test('explains each no-op outcome without revealing the address', async () => {
  for (const outcome of ['EMAIL_IN_USE', 'ALREADY_BOUND', 'ADMIN_UNAVAILABLE']) {
    const sql = { query() {}, async transaction() { return [[{ changed: 0, outcome }]]; } };
    await assert.rejects(bindAdminEmail(sql, 'person@example.test'), error => error.code === outcome && !error.message.includes('person@example.test'));
  }
});

test('classifies DB failures without printing raw error contents', async () => {
  for (const code of ['40001', '23505', '42501', '42P01', '42703', undefined]) {
    const failure = Object.assign(new Error('private@example.test postgres://private'), { code });
    assert.equal(bindingFailure(failure).includes('private'), false);
    const sql = { query() {}, async transaction() { throw failure; } };
    await assert.rejects(bindAdminEmail(sql, 'person@example.test'), error => error.code === 'SAFE_BINDING_FAILURE' && !error.message.includes('private'));
  }
});

test('rejects non-interactive input', () => {
  assert.throws(() => hiddenInput('prompt', { isTTY: false }, { isTTY: true }), /互動式終端機/);
});

test('hidden input never echoes typed content and restores terminal state', async () => {
  const input = new EventEmitter();
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode(value) { this.isRaw = value; }, resume() {}, pause() {} });
  let output = '';
  const result = hiddenInput('prompt:', input, { isTTY: true, write(value) { output += value; } });
  input.emit('keypress', 'private@example.test', {});
  input.emit('keypress', '\r', { name: 'return' });
  assert.equal(await result, 'private@example.test');
  assert.equal(output, 'prompt:\n');
  assert.equal(input.isRaw, false);
  assert.equal(input.listenerCount('keypress'), 0);
});

test('Ctrl+C cancels hidden input without leaking partial content', async () => {
  const input = new EventEmitter();
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode(value) { this.isRaw = value; }, resume() {}, pause() {} });
  let output = '';
  const result = hiddenInput('prompt:', input, { isTTY: true, write(value) { output += value; } });
  input.emit('keypress', 'private', {});
  input.emit('keypress', '\x03', { ctrl: true, name: 'c' });
  await assert.rejects(result, /操作已取消/);
  assert.equal(output, 'prompt:\n');
  assert.equal(input.isRaw, false);
});
