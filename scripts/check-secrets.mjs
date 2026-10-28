import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Print locations only, never matching content or loaded credentials.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, windowsHide: true });
const secrets = new Set();
for (const path of ['backend/.env', 'backend/.env.local', 'backend/.env.test.local', 'frontend/.env.local']) {
  if (!existsSync(path)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
    if (/SECRET|TOKEN|PASSWORD|DATABASE_URL|API_KEY|ENCRYPTION_KEY|ACCESS_KEY/i.test(key) && value.length >= 16) secrets.add(value);
  }
}
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['google-api-key', /AIza[0-9A-Za-z_-]{35}/],
  ['github-token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['aws-access-key', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ['resend-key', /\bre_[A-Za-z0-9]{24,}\b/],
  ['liveblocks-secret', /\bsk_(?:live|test|prod)_[A-Za-z0-9]{32,}\b/],
  ['webhook-secret', /\bwhsec_[A-Za-z0-9+/]{24,}={0,2}/],
  ['postgres-credential', /postgres(?:ql)?:\/\/[^\s:/'"]+:[^\s@/'"]{16,}@[^\s/'"]+/],
];
let risks = 0;
function inspect(text, location) {
  if (text.includes('\0')) return;
  const found = new Set();
  for (const secret of secrets) if (text.includes(secret)) found.add('matches-local-secret');
  for (const [name, pattern] of patterns) if (pattern.test(text)) found.add(name);
  for (const name of found) {
    console.error(`[RISK] ${location}: ${name}`);
    risks++;
  }
}
const staged = process.argv.includes('--staged');
const files = git('ls-files', '-z', ...(staged ? [] : ['--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean);
let count = 0;
for (const path of new Set(files)) {
  if (!staged && !existsSync(path)) continue;
  if (/(?:^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('/.env.example') && path !== '.env.example') {
    console.error(`[RISK] ${path}: tracked-environment-file`);
    risks++;
  }
  const content = staged ? git('show', `:${path}`) : readFileSync(path, 'utf8');
  inspect(content, `${staged ? 'index' : 'worktree'}:${path}`);
  count++;
}
if (process.argv.includes('--history')) {
  // Includes removed lines. Patch content stays in memory and is not logged.
  const history = git('log', '--all', '--no-ext-diff', '--no-color', '--format=COMMIT:%H', '-p');
  let commit = '', path = '';
  for (const line of history.split('\n')) {
    if (line.startsWith('COMMIT:')) commit = line.slice(7);
    else if (line.startsWith('diff --git ')) {
      path = line.slice(11);
      if (/(?:^|\/)\.env(?:\s|$|\.(?!example(?:\s|$)))/.test(path)) {
        console.error(`[RISK] history:${commit}:${path}: historical-environment-file`);
        risks++;
      }
    }
    else if (line.startsWith('+') || line.startsWith('-')) inspect(line, `history:${commit}:${path}`);
  }
}
console.log(`[${risks ? 'FAIL' : 'OK'}] Scanned ${count} files${process.argv.includes('--history') ? ' and Git history' : ''}; ${risks} risks. Values are never printed.`);
console.log('Heuristic checks plus exact local-secret matching cannot guarantee detection of every secret format; also review staged changes.');
process.exitCode = risks ? 1 : 0;
