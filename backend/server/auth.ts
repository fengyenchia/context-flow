import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest, NextResponse } from 'next/server';
import { ApiProblem, state, type User } from './state';

const accessSecret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET || 'development-access-secret-change-before-production');
const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-change-before-production');
const issuer = 'context-flow';
const audience = 'context-flow-web';
export const cookieName = 'contextflow_refresh';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function createSession(user: User) {
  const sid = randomUUID();
  const accessToken = await new SignJWT({ role: user.role, tv: user.tokenVersion, typ: 'access' }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('15m').sign(accessSecret);
  const refreshToken = await new SignJWT({ sid, tv: user.tokenVersion, typ: 'refresh' }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('30d').sign(refreshSecret);
  state.sessions.set(sid, { id: sid, userId: user.id, tokenHash: hash(refreshToken), expiresAt: new Date(Date.now() + 30 * 86400_000) });
  return { accessToken, refreshToken, user: state.publicUser(user) };
}

export function setRefreshCookie(response: NextResponse, token: string) {
  response.cookies.set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth', maxAge: 30 * 86400 });
}

export async function authenticate(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ApiProblem(401, '尚未登入');
  try {
    const { payload } = await jwtVerify(token, accessSecret, { issuer, audience, algorithms: ['HS256'] });
    const user = state.user(payload.sub!);
    if (payload.typ !== 'access' || payload.tv !== user.tokenVersion || user.status !== 'active') throw new Error('invalid');
    return user;
  } catch { throw new ApiProblem(401, '登入狀態已失效'); }
}

export async function rotateRefresh(token?: string) {
  if (!token) throw new ApiProblem(401, '缺少 refresh token');
  try {
    const { payload } = await jwtVerify(token, refreshSecret, { issuer, audience, algorithms: ['HS256'] });
    const session = state.sessions.get(String(payload.sid));
    const user = state.user(payload.sub!);
    if (!session || session.revokedAt || session.tokenHash !== hash(token) || session.expiresAt < new Date() || payload.tv !== user.tokenVersion || user.status !== 'active') throw new Error('invalid');
    session.revokedAt = new Date();
    return createSession(user);
  } catch { throw new ApiProblem(401, 'Refresh token 已失效'); }
}

export function revokeToken(token?: string) {
  if (!token) return;
  for (const session of state.sessions.values()) if (session.tokenHash === hash(token)) session.revokedAt = new Date();
}

function encryptionKey() {
  const raw = process.env.USER_API_KEY_ENCRYPTION_KEY;
  if (!raw) throw new ApiProblem(503, '尚未設定 USER_API_KEY_ENCRYPTION_KEY');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new ApiProblem(503, 'USER_API_KEY_ENCRYPTION_KEY 必須是 base64 32 bytes');
  return key;
}
export function encryptKey(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }; }
export function decryptKey(record: { encryptedApiKey: string; iv: string; authTag: string }) { const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64')); decipher.setAuthTag(Buffer.from(record.authTag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(record.encryptedApiKey, 'base64')), decipher.final()]).toString('utf8'); }
export { hash };
