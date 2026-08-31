import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: pnpm admin:hash-password "a-password-with-at-least-8-characters"');
  process.exitCode = 1;
} else {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  console.log(`scrypt$32768$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`);
}

