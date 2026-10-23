import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(new URL('./check-secrets.mjs', import.meta.url));
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'context-flow-secret-check-'));
  // Only remove the exact temporary fixture created by mkdtemp, never a repo.
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe', windowsHide: true });
  git('init', '-q');
  const write = (path, value) => writeFileSync(join(cwd, path), value);
  const commit = () => git('-c', 'user.name=Secret Check Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture');
  const scan = (...args) => spawnSync(process.execPath, [scanner, ...args], { cwd, encoding: 'utf8', windowsHide: true });
  const safeFailure = (result, value) => {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[RISK\]/);
    assert.ok(!(result.stdout + result.stderr).includes(value));
  };
  return { cwd, git, write, commit, scan, safeFailure };
}

test('blank environment example is permitted in worktree, index and history', (t) => {
  const f = fixture(t);
  f.write('.env.example', 'DATABASE_URL=\nJWT_ACCESS_SECRET=\n');
  f.git('add', '.'); f.commit();
  assert.equal(f.scan('--staged', '--history').status, 0);
});

test('matches local sensitive values without printing their contents', (t) => {
  const f = fixture(t);
  const value = ['fixture', 'sensitive', 'local', 'value'].join('-');
  mkdirSync(join(f.cwd, 'backend'));
  f.write('backend/.env.local', `JWT_ACCESS_SECRET=${value}\n`);
  f.write('.gitignore', '.env*\n');
  f.write('source.txt', value);
  f.safeFailure(f.scan(), value);
});

test('staged scan checks the index rather than unstaged working changes', (t) => {
  const f = fixture(t);
  const token = ['gh', 'p_', 'A'.repeat(36)].join('');
  f.write('source.txt', 'safe'); f.git('add', '.');
  f.write('source.txt', token);
  assert.equal(f.scan('--staged').status, 0);
  f.safeFailure(f.scan(), token);
  f.git('add', '.');
  f.safeFailure(f.scan('--staged'), token);
});

test('finds a removed token in committed history', (t) => {
  const f = fixture(t);
  const token = ['AI', 'za', 'X'.repeat(35)].join('');
  f.write('source.txt', token); f.git('add', '.'); f.commit();
  f.write('source.txt', 'safe'); f.git('add', '.'); f.commit();
  assert.equal(f.scan().status, 0);
  f.safeFailure(f.scan('--history'), token);
});

test('rejects a historically tracked environment file even without known tokens', (t) => {
  const f = fixture(t);
  f.write('.env.local', 'PUBLIC_APP_URL=http://localhost:3000');
  f.git('add', '.'); f.commit();
  f.git('rm', '.env.local'); f.commit();
  assert.equal(f.scan().status, 0);
  assert.equal(f.scan('--history').status, 1);
});

test('ignored local credential files are not candidates for commit', (t) => {
  const f = fixture(t);
  f.write('.gitignore', '.env*\n');
  f.write('.env.local', ['RESEND_API_KEY=', 're_', 'X'.repeat(30)].join(''));
  assert.equal(f.scan().status, 0);
});
