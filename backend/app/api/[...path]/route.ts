import { randomBytes, randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { authenticate, cookieName, createSession, decryptKey, encryptKey, hash, revokeToken, rotateRefresh, setRefreshCookie } from '@/server/auth';
import { ApiProblem, state, type User } from '@/server/state';
import { hashPassword, verifyPassword } from '@/server/password';
import { brandedEmail, sendEmail } from '@/server/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  Vary: 'Origin',
};
const ok = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: corsHeaders });

async function body(request: NextRequest) {
  try { return await request.json() as Record<string, unknown>; }
  catch { throw new ApiProblem(400, 'JSON 格式錯誤'); }
}
const requiredString = (value: unknown, name: string, min = 1) => {
  if (typeof value !== 'string' || value.trim().length < min) throw new ApiProblem(400, `${name} 格式不正確`);
  return value.trim();
};
const responseCredential = (record: { keyHint: string; updatedAt: Date; lastValidatedAt?: Date }) => ({ provider: 'gemini', keyHint: record.keyHint, updatedAt: record.updatedAt, lastValidatedAt: record.lastValidatedAt });
const geminiModel = () => process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';

type DataResource = { id: string; kind: 'text' | 'link' | 'file' | 'image'; title: string; content?: string; url?: string };
const dataResources = (value: unknown): DataResource[] => {
  if (!Array.isArray(value) || value.length === 0) throw new ApiProblem(400, '請先加入至少一筆資料');
  return value.slice(0, 24).map((item, index) => {
    if (!item || typeof item !== 'object') throw new ApiProblem(400, '資料格式不正確');
    const record = item as Record<string, unknown>;
    const kind = record.kind;
    if (kind !== 'text' && kind !== 'link' && kind !== 'file' && kind !== 'image') throw new ApiProblem(400, '資料類型不正確');
    return { id: typeof record.id === 'string' ? record.id.slice(0, 100) : `resource-${index + 1}`, kind, title: requiredString(record.title, '資料標題'), content: typeof record.content === 'string' ? record.content.slice(0, 8000) : undefined, url: typeof record.url === 'string' ? record.url.slice(0, 2000) : undefined };
  });
};
const findUserByEmail = (email: string) => {
  const legacyState = state as typeof state & { findUserByEmail?: (value: string) => User | undefined };
  return typeof legacyState.findUserByEmail === 'function' ? legacyState.findUserByEmail(email) : [...state.users.values()].find((item) => item.email === email.trim().toLowerCase());
};
const fallbackStructure = (resources: DataResource[]) => ({
  summary: `已彙整 ${resources.length} 筆資料，先以資料來源與共同主題建立閱讀路徑。`,
  nodes: resources.slice(0, 6).map((resource, index) => ({ id: `source-${index + 1}`, label: resource.title, description: resource.content?.slice(0, 120) || (resource.url ? '外部連結，待擷取重點' : `${resource.kind} 資料`), sourceIds: [resource.id], kind: index === 0 ? 'core' : 'reference' })),
  edges: resources.slice(1, 6).map((resource, index) => ({ source: 'source-1', target: `source-${index + 2}`, label: '關聯' })),
});
const parseStructure = (text: string, resources: DataResource[]) => {
  try {
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').trim();
    const result = JSON.parse(cleaned) as { summary?: unknown; nodes?: unknown; edges?: unknown };
    if (!Array.isArray(result.nodes) || !Array.isArray(result.edges)) return fallbackStructure(resources);
    const nodes = result.nodes.slice(0, 12).flatMap((node, index) => {
      if (!node || typeof node !== 'object') return [];
      const item = node as Record<string, unknown>;
      if (typeof item.label !== 'string') return [];
      return [{ id: `core-${index + 1}`, label: item.label.slice(0, 100), description: typeof item.description === 'string' ? item.description.slice(0, 180) : '', sourceIds: Array.isArray(item.sourceIds) ? item.sourceIds.filter((id): id is string => typeof id === 'string').slice(0, 8) : [], kind: item.kind === 'insight' ? 'insight' : item.kind === 'reference' ? 'reference' : 'core' }];
    });
    if (!nodes.length) return fallbackStructure(resources);
    const edges = (result.edges as unknown[]).slice(0, 20).flatMap((edge) => {
      if (!edge || typeof edge !== 'object') return [];
      const item = edge as Record<string, unknown>; const sourceIndex = Number(item.source); const targetIndex = Number(item.target);
      if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) || !nodes[sourceIndex] || !nodes[targetIndex] || sourceIndex === targetIndex) return [];
      return [{ source: nodes[sourceIndex].id, target: nodes[targetIndex].id, label: typeof item.label === 'string' ? item.label.slice(0, 40) : '關聯' }];
    });
    return { summary: typeof result.summary === 'string' ? result.summary.slice(0, 300) : `已整理 ${resources.length} 筆資料。`, nodes, edges };
  } catch { return fallbackStructure(resources); }
};

async function handler(request: NextRequest, context: Context) {
  try {
    const { path } = await context.params;
    const route = path.join('/');
    const method = request.method;

    if (route === 'health' && method === 'GET') return ok({ status: 'ok', service: 'context-flow-next', dataMode: 'memory', integrations: { neon: Boolean(process.env.DATABASE_URL), r2: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME), inngest: Boolean(process.env.INNGEST_EVENT_KEY), apiKeyEncryption: Boolean(process.env.USER_API_KEY_ENCRYPTION_KEY) } });

    if (route === 'auth/register' && method === 'POST') {
      const data = await body(request);
      const username = requiredString(data.username, '帳號', 3).toLowerCase();
      if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) throw new ApiProblem(400, '帳號只能使用英文、數字、_、.、-');
      const displayName = requiredString(data.displayName, '顯示名稱');
      const email = requiredString(data.email, 'Email').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiProblem(400, 'Email 格式不正確');
      if (findUserByEmail(email)) throw new ApiProblem(409, 'Email 已被使用');
      const password = requiredString(data.password, '密碼', 8);
      const user = state.createUser({ username, email, displayName, passwordHash: await hashPassword(password) });
      user.email = email;
      const verificationToken = randomBytes(32).toString('base64url'); const verificationId = randomUUID(); state.emailVerifications.set(verificationId, { id: verificationId, userId: user.id, tokenHash: hash(verificationToken), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) });
      const verifyUrl = `${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/verify-email?token=${encodeURIComponent(verificationToken)}`;
      void sendEmail({ to: email, subject: '驗證你的 ContextFlow Email', text: `請點擊連結驗證你的 ContextFlow 帳號：${verifyUrl}`, html: brandedEmail({ eyebrow: 'Email verification', title: '歡迎加入 ContextFlow', body: '請點擊下方按鈕驗證你的 Email，完成後就能開始整理你的專案脈絡。', actionLabel: '驗證 Email', actionUrl: verifyUrl, expires: '此連結 24 小時內有效。若不是你註冊的，請忽略此信。' }) }).catch((error) => console.error('Verification email failed', error));
      return ok({ user: state.publicUser(user), emailVerificationSent: true }, 201);
    }
    if (route === 'auth/check-username' && method === 'POST') { const data = await body(request); const username = requiredString(data.username, '帳號').toLowerCase(); return ok({ exists: Boolean(state.findUser(username)) }); }
    if (route === 'auth/verify-email' && method === 'GET') { const token = new URL(request.url).searchParams.get('token'); const record = token ? [...state.emailVerifications.values()].find((item) => item.tokenHash === hash(token)) : undefined; if (!record || record.consumedAt || record.expiresAt < new Date()) throw new ApiProblem(400, 'Email 驗證連結無效或已過期'); const user = state.user(record.userId); user.emailVerifiedAt = new Date(); record.consumedAt = new Date(); return ok({ ok: true, message: 'Email 已驗證' }); }
    if (route === 'auth/login' && method === 'POST') {
      const data = await body(request); const user = state.findUser(requiredString(data.username, '帳號'));
      if (data.email && (!user || user.email !== String(data.email).trim().toLowerCase())) throw new ApiProblem(401, '帳號或密碼錯誤');
      if (!user || user.status !== 'active' || !(await verifyPassword(user.passwordHash, requiredString(data.password, '密碼')))) throw new ApiProblem(401, '帳號或密碼錯誤');
      if (!user.emailVerifiedAt) throw new ApiProblem(403, '請先驗證 Email，再登入 ContextFlow');
      user.lastLoginAt = new Date(); const session = await createSession(user); const response = ok({ accessToken: session.accessToken, user: session.user }); setRefreshCookie(response, session.refreshToken); return response;
    }
    if (route === 'auth/refresh' && method === 'POST') {
      const session = await rotateRefresh(request.cookies.get(cookieName)?.value); if (!session.user.emailVerifiedAt) throw new ApiProblem(403, '請先驗證 Email，再登入 ContextFlow'); const response = ok({ accessToken: session.accessToken, user: session.user }); setRefreshCookie(response, session.refreshToken); return response;
    }
    if (route === 'auth/logout' && method === 'POST') { revokeToken(request.cookies.get(cookieName)?.value); const response = ok({ ok: true }); response.cookies.set(cookieName, '', { httpOnly: true, path: '/api/auth', maxAge: 0 }); return response; }
    if (route === 'auth/reset-password' && method === 'POST') {
      const data = await body(request); const code = requiredString(data.resetCode, '重設碼'); const record = [...state.resets.values()].find((item) => item.tokenHash === hash(code));
      if (!record || record.consumedAt || record.expiresAt < new Date()) throw new ApiProblem(400, '重設碼無效或已過期');
      const user = state.user(record.userId); user.passwordHash = await hashPassword(requiredString(data.newPassword, '新密碼', 8)); user.tokenVersion += 1; record.consumedAt = new Date(); for (const session of state.sessions.values()) if (session.userId === user.id) session.revokedAt = new Date(); return ok({ ok: true });
    }
    if (route === 'auth/forgot-password' && method === 'POST') { const data = await body(request); const username = requiredString(data.username, '帳號').toLowerCase(); const email = requiredString(data.email, 'Email').toLowerCase(); const target = state.findUser(username); if (!target || target.email !== email) throw new ApiProblem(400, '帳號與 Email 不相符'); for (const record of state.resets.values()) if (record.userId === target.id && !record.consumedAt) record.consumedAt = new Date(); const resetCode = randomBytes(24).toString('base64url'); state.resets.set(randomUUID(), { id: randomUUID(), userId: target.id, tokenHash: hash(resetCode), expiresAt: new Date(Date.now() + 30 * 60_000) }); const resetUrl = `${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?code=${encodeURIComponent(resetCode)}`; void sendEmail({ to: email, subject: '重設 ContextFlow 密碼', text: `請點擊連結重設密碼：${resetUrl}`, html: brandedEmail({ eyebrow: 'Password reset', title: '重設你的 ContextFlow 密碼', body: '我們收到重設密碼的請求。請點擊下方按鈕後設定新的密碼，不需要手動輸入驗證碼。', actionLabel: '重設密碼', actionUrl: resetUrl, expires: '若你再次要求寄送，這封信的連結會立即失效。若不是你發起的，請忽略此信。' }) }).catch((error) => console.error('Password reset email failed', error)); return ok({ ok: true, message: '重設連結已寄出' }); }

    const user = await authenticate(request);

    if (route === 'account' && method === 'GET') return ok(state.publicUser(user));
    if (route === 'account/profile' && method === 'PATCH') { const data = await body(request); user.displayName = requiredString(data.displayName, '顯示名稱'); return ok(state.publicUser(user)); }
    if (route === 'account/password' && method === 'PATCH') { const data = await body(request); if (!(await verifyPassword(user.passwordHash, requiredString(data.currentPassword, '目前密碼')))) throw new ApiProblem(400, '目前密碼錯誤'); user.passwordHash = await hashPassword(requiredString(data.newPassword, '新密碼', 8)); user.tokenVersion += 1; for (const session of state.sessions.values()) if (session.userId === user.id) session.revokedAt = new Date(); return ok({ ok: true, reauthenticate: true }); }

    if (route === 'account/ai-credentials' && method === 'GET') { const record = state.credentials.get(user.id); return ok(record ? [responseCredential(record)] : []); }
    if (route === 'account/ai-credentials/gemini' && method === 'PUT') {
      const data = await body(request); const apiKey = requiredString(data.apiKey, 'Gemini API Key', 10); const client = new GoogleGenAI({ apiKey });
      try { await client.models.generateContent({ model: geminiModel(), contents: 'Reply with OK.' }); } catch { throw new ApiProblem(400, 'Gemini API Key 驗證失敗'); }
      const encrypted = encryptKey(apiKey); const record = { userId: user.id, encryptedApiKey: encrypted.encrypted, iv: encrypted.iv, authTag: encrypted.authTag, keyHint: `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`, updatedAt: new Date(), lastValidatedAt: new Date() }; state.credentials.set(user.id, record); return ok(responseCredential(record));
    }
    if (route === 'account/ai-credentials/gemini/test' && method === 'POST') { const record = state.credentials.get(user.id); if (!record) throw new ApiProblem(404, '尚未設定 Gemini API Key'); const client = new GoogleGenAI({ apiKey: decryptKey(record) }); await client.models.generateContent({ model: geminiModel(), contents: 'Reply with OK.' }); record.lastValidatedAt = new Date(); return ok({ ok: true }); }
    if (route === 'account/ai-credentials/gemini' && method === 'DELETE') { state.credentials.delete(user.id); return ok({ ok: true }); }
    if (route === 'ai/chat' && method === 'POST') {
      const data = await body(request); const record = state.credentials.get(user.id); if (!record) throw new ApiProblem(400, '請先在設定頁新增 Gemini API Key');
      const client = new GoogleGenAI({ apiKey: decryptKey(record) });
      try {
        const result = await client.models.generateContent({ model: geminiModel(), contents: requiredString(data.prompt, '問題'), config: { systemInstruction: 'You are ContextFlow, a concise project thinking partner. Reply in the user language using Markdown. Lead with the answer, use short meaningful headings and bullet points when useful, preserve important facts, and remove generic preambles, repetition, filler, and low-value examples. Keep each point specific enough to become a useful knowledge node.' } });
        return ok({ content: result.text ?? '', model: geminiModel() });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (/429|rate.?limit|quota|resource exhausted/i.test(detail)) throw new ApiProblem(429, 'Gemini API 額度或頻率限制，請稍後再試');
        if (/401|403|api key| unauthoriz|permission/i.test(detail)) throw new ApiProblem(400, 'Gemini API Key 無效或沒有權限');
        if (/404|not found|model/i.test(detail)) throw new ApiProblem(400, `Gemini 模型「${geminiModel()}」不存在或不可用`);
        throw new ApiProblem(502, 'Gemini 暫時無法回應，請稍後再試');
      }
    }

    if (route === 'workspaces' && method === 'GET') return ok([...state.memberships.values()].filter((item) => item.userId === user.id).map((membership) => { const workspace = state.workspace(membership.workspaceId); return { ...workspace, role: membership.role, projectCount: [...state.projects.values()].filter((item) => item.workspaceId === workspace.id).length, memberCount: [...state.memberships.values()].filter((item) => item.workspaceId === workspace.id).length }; }));
    if (route === 'workspaces' && method === 'POST') { const data = await body(request); const workspace = { id: randomUUID(), name: requiredString(data.name, '工作區名稱'), kind: 'shared' as const, createdByUserId: user.id, createdAt: new Date() }; state.workspaces.set(workspace.id, workspace); state.memberships.set(state.memberKey(workspace.id, user.id), { workspaceId: workspace.id, userId: user.id, role: 'owner', joinedAt: new Date() }); return ok({ ...workspace, role: 'owner', projectCount: 0, memberCount: 1 }, 201); }
    if (route === 'workspace-invitations' && method === 'GET') return ok([...state.invitations.values()].filter((item) => item.targetUserId === user.id && item.status === 'pending').map((item) => ({ ...item, workspace: state.workspace(item.workspaceId) })));

    let match = route.match(/^workspace-invitations\/([^/]+)\/(accept|decline)$/);
    if (match && method === 'POST') { const invitation = state.invitations.get(match[1]); if (!invitation || invitation.targetUserId !== user.id || invitation.status !== 'pending') throw new ApiProblem(404, '找不到邀請'); invitation.status = match[2] === 'accept' ? 'accepted' : 'declined'; if (invitation.status === 'accepted') state.memberships.set(state.memberKey(invitation.workspaceId, user.id), { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role, joinedAt: new Date() }); return ok({ ok: true }); }
    match = route.match(/^workspaces\/([^/]+)\/invitations$/);
    if (match && method === 'POST') { state.requireRole(match[1], user.id, ['owner', 'admin']); const data = await body(request); const target = state.findUser(requiredString(data.username, '帳號')); if (!target) throw new ApiProblem(404, '找不到使用者'); if (state.member(match[1], target.id)) throw new ApiProblem(409, '此使用者已是成員'); const role = requiredString(data.role, '角色') as 'admin' | 'editor' | 'viewer'; if (!['admin', 'editor', 'viewer'].includes(role)) throw new ApiProblem(400, '角色無效'); const invitation = { id: randomUUID(), workspaceId: match[1], targetUserId: target.id, invitedByUserId: user.id, role, status: 'pending' as const, createdAt: new Date() }; state.invitations.set(invitation.id, invitation); return ok(invitation, 201); }
    match = route.match(/^workspaces\/([^/]+)\/projects$/);
    if (match && method === 'GET') { state.requireRole(match[1], user.id, ['owner', 'admin', 'editor', 'viewer']); return ok([...state.projects.values()].filter((item) => item.workspaceId === match![1])); }
    if (match && method === 'POST') { state.requireRole(match[1], user.id, ['owner', 'admin', 'editor']); const data = await body(request); const project = { id: randomUUID(), workspaceId: match[1], createdByUserId: user.id, name: requiredString(data.name, '專案名稱'), description: typeof data.description === 'string' ? data.description.trim() : '', layoutDirection: data.layoutDirection === 'TB' ? 'TB' as const : 'LR' as const, createdAt: new Date() }; state.projects.set(project.id, project); return ok({ ...project, roomId: `project:${project.id}` }, 201); }
    match = route.match(/^projects\/([^/]+)$/);
    if (match && method === 'GET') { const project = state.project(match[1]); const membership = state.requireRole(project.workspaceId, user.id, ['owner', 'admin', 'editor', 'viewer']); return ok({ ...project, role: membership.role, roomId: `project:${project.id}` }); }
    match = route.match(/^projects\/([^/]+)\/data-zone\/structure$/);
    if (match && method === 'POST') {
      const project = state.project(match[1]); state.requireRole(project.workspaceId, user.id, ['owner', 'admin', 'editor']);
      const record = state.credentials.get(user.id); if (!record) throw new ApiProblem(400, '請先在設定頁新增 Gemini API Key，才能整理 Data Zone');
      const resources = dataResources((await body(request)).resources);
      const client = new GoogleGenAI({ apiKey: decryptKey(record) });
      const sourceText = resources.map((resource, index) => `[${index + 1}] id=${resource.id}; type=${resource.kind}; title=${resource.title}; content=${resource.content ?? ''}; url=${resource.url ?? ''}`).join('\n');
      const prompt = `You structure mixed research data for a collaborative project. Reply ONLY valid JSON, no markdown. The user reads Traditional Chinese. Produce {"summary":"...","nodes":[{"label":"...","description":"...","sourceIds":["resource id"],"kind":"core|reference|insight"}],"edges":[{"source":0,"target":1,"label":"..."}]}. Nodes are a concise causal/semantic map, maximum 8. Edges use zero-based node indices. Do not invent facts.\n\nSources:\n${sourceText}`;
      try { const result = await client.models.generateContent({ model: geminiModel(), contents: prompt, config: { responseMimeType: 'application/json' } }); return ok(parseStructure(result.text ?? '', resources)); }
      catch { throw new ApiProblem(502, 'Data Zone 整理失敗，請確認 Gemini Key 與資料內容後重試'); }
    }

    if (route === 'admin/users' && method === 'GET') { requireAdmin(user); return ok([...state.users.values()].map((item) => ({ ...state.publicUser(item), workspaceCount: [...state.memberships.values()].filter((m) => m.userId === item.id).length, projectCount: [...state.projects.values()].filter((project) => Boolean(state.member(project.workspaceId, item.id))).length }))); }
    match = route.match(/^admin\/users\/([^/]+)\/(status|role)$/);
    if (match && method === 'PATCH') { requireAdmin(user); const target = state.user(match[1]); const data = await body(request); if (match[2] === 'status') { const status = data.status; if (status !== 'active' && status !== 'suspended') throw new ApiProblem(400, '狀態無效'); if (target.id === user.id && status === 'suspended') throw new ApiProblem(400, '不能停權自己'); target.status = status; } else { const role = data.role; if (role !== 'user' && role !== 'admin') throw new ApiProblem(400, '角色無效'); target.role = role; target.tokenVersion += 1; } return ok(state.publicUser(target)); }
    throw new ApiProblem(404, '找不到 API 路由');
  } catch (error) {
    if (error instanceof ApiProblem) return ok({ message: error.message }, error.status);
    console.error('API error', error);
    return ok({ message: '伺服器發生錯誤' }, 500);
  }
}

function requireAdmin(user: User) { if (user.role !== 'admin') throw new ApiProblem(403, '僅限管理員'); }

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: corsHeaders });

