import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
const scrypt = (password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }) =>
  new Promise<Buffer>((resolve, reject) => nodeScrypt(password, salt, length, options, (error, derived) => error ? reject(error) : resolve(derived)));

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(stored: string, password: string) {
  const [algorithm, n, r, p, saltValue, hashValue] = stored.split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
