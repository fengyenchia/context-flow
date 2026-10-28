import { randomBytes, randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { authenticate, cookieName, createSession, decryptKey, encryptKey, hash, revokeToken, rotateRefresh, setRefreshCookie } from '@/server/auth';
import { ApiProblem, state, type User } from '@/server/state';
import { hashPassword, verifyPassword } from '@/server/password';
import { brandedEmail, sendEmail } from '@/server/email';
import { prepareUpload, completeUpload, downloadFile } from '@/server/files';
import { enforceAuthRate } from '@/server/rate-limit';
import { geminiFailure } from '@/server/gemini-errors';
import { db } from '@/src/db/client';
import { authorizeCollaboration, collaborationEnabled, deleteCollaborativeRoom, readCollaborativeCanvas, revokeCollaborativeRoom, syncRoomPermissions, syncWorkspaceRooms } from '@/server/collaboration';
import { withCollaborationLock } from '@/server/collaboration-lock';
import { canvasBackupEnabled, captureCanvasBackup, listCanvasBackups, restoreCanvasBackup } from '@/server/canvas-backups';
import { projectInvitesEnabled } from '@/server/project-invite-config';
import { acceptProjectLink, createProjectLink, listProjectLinks, previewProjectLink, updateProjectLink } from '@/server/project-invites';

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
const geminiModel = () => process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

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

async function handleRequest(request: NextRequest, context: Context) {
  try {
    const { path } = await context.params;
    const route = path.join('/');
    const method = request.method;

    if (route === 'health' && method === 'GET') return ok({ status: 'ok', service: 'context-flow-next', dataMode: (db ? 'neon' : 'memory'), integrations: { neon: Boolean(process.env.DATABASE_URL), r2: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY), inngest: Boolean(process.env.INNGEST_EVENT_KEY), email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM), apiKeyEncryption: Boolean(process.env.USER_API_KEY_ENCRYPTION_KEY) } });

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
      await sendEmail({ to: email, subject: '驗證你的 ContextFlow Email', text: `請點擊連結驗證你的 ContextFlow 帳號：${verifyUrl}`, html: brandedEmail({ eyebrow: 'Email verification', title: '歡迎加入 ContextFlow', body: '請點擊下方按鈕驗證你的 Email，完成後就能開始整理你的專案脈絡。', actionLabel: '驗證 Email', actionUrl: verifyUrl, expires: '此連結 24 小時內有效。若不是你註冊的，請忽略此信。' }) }).catch(() => { throw new ApiProblem(503, '驗證郵件暫時無法寄出，請稍後重試'); });
      return ok({ user: state.publicUser(user), emailVerificationSent: true }, 201);
    }
    if (route === 'auth/check-username' && method === 'POST') { const data = await body(request); const username = requiredString(data.username, '帳號').toLowerCase(); return ok({ exists: Boolean(state.findUser(username)) }); }
    if (route === 'auth/verify-email' && method === 'GET') { const token = new URL(request.url).searchParams.get('token'); const record = token ? [...state.emailVerifications.values()].find((item) => item.tokenHash === hash(token)) : undefined; if (!record) throw new ApiProblem(400, 'Email 驗證連結無效或已過期'); const user = state.user(record.userId); if (record.consumedAt && user.emailVerifiedAt) return ok({ ok: true, message: 'Email 已完成驗證，無需重複操作' }); if (record.consumedAt || record.expiresAt < new Date()) throw new ApiProblem(400, 'Email 驗證連結無效或已過期'); user.emailVerifiedAt = new Date(); record.consumedAt = new Date(); return ok({ ok: true, message: 'Email 已驗證' }); }
    if (route === 'auth/resend-verification' && method === 'POST') {
      const data = await body(request); const target = state.findUser(requiredString(data.username, '帳號'));
      if (target && !target.emailVerifiedAt && target.email === requiredString(data.email, 'Email').toLowerCase()) {
        for (const token of state.emailVerifications.values()) if (token.userId === target.id && !token.consumedAt) token.consumedAt = new Date();
        const token = randomBytes(32).toString('base64url'); const id = randomUUID();
        state.emailVerifications.set(id, { id, userId: target.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 86400_000) });
        const url = `${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/verify-email?token=${encodeURIComponent(token)}`;
        await sendEmail({ to: target.email!, subject: '驗證你的 ContextFlow Email', text: `驗證連結：${url}`, html: brandedEmail({ eyebrow: 'Email verification', title: '驗證你的 Email', body: '請使用最新的驗證連結完成註冊。', actionLabel: '驗證 Email', actionUrl: url, expires: '連結 24 小時內有效；舊連結已失效。' }) }).catch(() => { throw new ApiProblem(503, '驗證郵件暫時無法寄出，請稍後重試'); });
      }
      return ok({ message: '若帳號與 Email 相符且尚未驗證，已寄出新的驗證信。' });
    }
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
    if (route === 'auth/forgot-password' && method === 'POST') { const data = await body(request); const username = requiredString(data.username, '帳號').toLowerCase(); const email = requiredString(data.email, 'Email').toLowerCase(); const target = state.findUser(username); if (!target || target.email !== email) throw new ApiProblem(400, '帳號與 Email 不相符'); for (const record of state.resets.values()) if (record.userId === target.id && !record.consumedAt) record.consumedAt = new Date(); const resetCode = randomBytes(24).toString('base64url'); state.resets.set(randomUUID(), { id: randomUUID(), userId: target.id, tokenHash: hash(resetCode), expiresAt: new Date(Date.now() + 30 * 60_000) }); const resetUrl = `${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?code=${encodeURIComponent(resetCode)}`; await sendEmail({ to: email, subject: '重設 ContextFlow 密碼', text: `請點擊連結重設密碼：${resetUrl}`, html: brandedEmail({ eyebrow: 'Password reset', title: '重設你的 ContextFlow 密碼', body: '我們收到重設密碼的請求。請點擊下方按鈕後設定新的密碼，不需要手動輸入驗證碼。', actionLabel: '重設密碼', actionUrl: resetUrl, expires: '若你再次要求寄送，這封信的連結會立即失效。若不是你發起的，請忽略此信。' }) }).catch(() => { throw new ApiProblem(503, '驗證郵件暫時無法寄出，請稍後重試'); }); return ok({ ok: true, message: '重設連結已寄出' }); }

    const user = await authenticate(request);

    if (route === 'account' && method === 'GET') return ok(state.publicUser(user));
    if (route === 'account/profile' && method === 'PATCH') { const data = await body(request); user.displayName = requiredString(data.displayName, '顯示名稱'); return ok(state.publicUser(user)); }
    if (route === 'account/password' && method === 'PATCH') { const data = await body(request); if (!(await verifyPassword(user.passwordHash, requiredString(data.currentPassword, '目前密碼')))) throw new ApiProblem(400, '目前密碼錯誤'); user.passwordHash = await hashPassword(requiredString(data.newPassword, '新密碼', 8)); user.tokenVersion += 1; for (const session of state.sessions.values()) if (session.userId === user.id) session.revokedAt = new Date(); return ok({ ok: true, reauthenticate: true }); }

    if (route === 'account/ai-credentials' && method === 'GET') { const record = state.credentials.get(user.id); return ok(record ? [responseCredential(record)] : []); }
    if (route === 'account/ai-credentials/gemini' && method === 'PUT') {
      const data = await body(request); const apiKey = requiredString(data.apiKey, 'Gemini API Key', 10); const client = new GoogleGenAI({ apiKey });
      try { await client.models.generateContent({ model: geminiModel(), contents: 'Reply with OK.' }); } catch (error) { throw geminiFailure(error, geminiModel()); }
      const encrypted = encryptKey(apiKey); const record = { userId: user.id, encryptedApiKey: encrypted.encrypted, iv: encrypted.iv, authTag: encrypted.authTag, keyHint: `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`, updatedAt: new Date(), lastValidatedAt: new Date() }; state.credentials.set(user.id, record); return ok(responseCredential(record));
    }
    if (route === 'account/ai-credentials/gemini/test' && method === 'POST') { const record = state.credentials.get(user.id); if (!record) throw new ApiProblem(404, '尚未設定 Gemini API Key'); const client = new GoogleGenAI({ apiKey: decryptKey(record) }); try { await client.models.generateContent({ model: geminiModel(), contents: 'Reply with OK.' }); } catch (error) { throw geminiFailure(error, geminiModel()); } record.lastValidatedAt = new Date(); return ok({ ok: true }); }
    if (route === 'account/ai-credentials/gemini' && method === 'DELETE') { state.credentials.delete(user.id); return ok({ ok: true }); }
    if (route === 'ai/chat' && method === 'POST') {
      const projectId = (await request.clone().json().catch(() => ({})) as Record<string, unknown>).projectId;
      if (typeof projectId === 'string') state.requireProjectRole(projectId, user.id, ['owner', 'admin', 'editor', 'viewer']);
      const data = await body(request); const record = state.credentials.get(user.id); if (!record) throw new ApiProblem(400, '請先在設定頁新增 Gemini API Key');
      const client = new GoogleGenAI({ apiKey: decryptKey(record) });
      try {
        const result = await client.models.generateContent({ model: geminiModel(), contents: requiredString(data.prompt, '問題'), config: { systemInstruction: 'You are ContextFlow, a concise project thinking partner. Reply in the user language using Markdown. Lead with the answer, use short meaningful headings and bullet points when useful, preserve important facts, and remove generic preambles, repetition, filler, and low-value examples. Keep each point specific enough to become a useful knowledge node.' } });
        return ok({ content: result.text ?? '', model: geminiModel() });
      } catch (error) {
        throw geminiFailure(error, geminiModel());
      }
    }

    if (route === 'workspaces' && method === 'GET') return ok([...state.memberships.values()].filter((item) => item.userId === user.id).map((membership) => { const workspace = state.workspace(membership.workspaceId); return { ...workspace, role: membership.role, projectCount: [...state.projects.values()].filter((item) => item.workspaceId === workspace.id).length, memberCount: [...state.memberships.values()].filter((item) => item.workspaceId === workspace.id).length }; }));
    if (route === 'shared-projects' && method === 'GET') return ok(projectInvitesEnabled() ? [...state.projects.values()].filter(project => !state.member(project.workspaceId, user.id) && state.projectRole(project.id, user.id)).map(project => ({ ...project, role: state.projectRole(project.id, user.id), accessSource: 'invitation' })) : []);
    if (route === 'project-invitations/preview' && method === 'POST') return ok(previewProjectLink((await body(request)).token));
    if (route === 'project-invitations/accept' && method === 'POST') return ok(acceptProjectLink((await body(request)).token, user.id));
    if (route === 'workspaces' && method === 'POST') { const data = await body(request); const workspace = { id: randomUUID(), name: requiredString(data.name, '工作區名稱'), kind: 'shared' as const, createdByUserId: user.id, createdAt: new Date() }; state.workspaces.set(workspace.id, workspace); state.memberships.set(state.memberKey(workspace.id, user.id), { workspaceId: workspace.id, userId: user.id, role: 'owner', joinedAt: new Date() }); return ok({ ...workspace, role: 'owner', projectCount: 0, memberCount: 1 }, 201); }
    if (route === 'workspace-invitations' && method === 'GET') return ok([...state.invitations.values()].filter((item) => item.targetUserId === user.id && item.status === 'pending').map((item) => ({ ...item, workspace: state.workspace(item.workspaceId) })));

    let match = route.match(/^workspace-invitations\/([^/]+)\/(accept|decline)$/);
    if (match && method === 'POST') { const invitation = state.invitations.get(match[1]); if (!invitation || invitation.targetUserId !== user.id || invitation.status !== 'pending') throw new ApiProblem(404, '找不到邀請'); invitation.status = match[2] === 'accept' ? 'accepted' : 'declined'; if (invitation.status === 'accepted') state.memberships.set(state.memberKey(invitation.workspaceId, user.id), { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role, joinedAt: new Date() }); return ok({ ok: true }); }
    match = route.match(/^workspaces\/([^/]+)\/invitations$/);
    if (match && method === 'POST') { const actor = state.requireRole(match[1], user.id, ['owner', 'admin']); if (state.workspace(match[1]).kind !== 'shared') throw new ApiProblem(400, '個人工作區不能邀請成員'); const data = await body(request); const target = state.findUser(requiredString(data.username, '帳號')); if (!target) throw new ApiProblem(404, '找不到使用者'); if (state.member(match[1], target.id)) throw new ApiProblem(409, '此使用者已是成員'); const role = requiredString(data.role, '角色') as 'admin' | 'editor' | 'viewer'; if (!['admin', 'editor', 'viewer'].includes(role)) throw new ApiProblem(400, '角色無效'); if (actor.role === 'admin' && role === 'admin') throw new ApiProblem(403, '只有擁有者可以邀請管理員'); if ([...state.invitations.values()].some((item) => item.workspaceId === match![1] && item.targetUserId === target.id && item.status === 'pending')) throw new ApiProblem(409, '此使用者已有待處理邀請'); const invitation = { id: randomUUID(), workspaceId: match[1], targetUserId: target.id, invitedByUserId: user.id, role, status: 'pending' as const, createdAt: new Date() }; state.invitations.set(invitation.id, invitation); return ok(invitation, 201); }
    match = route.match(/^workspaces\/([^/]+)\/members(?:\/([^/]+))?$/);
    if (match) {
      const workspaceId = match[1]; const targetId = match[2];
      const actor = state.requireRole(workspaceId, user.id, ['owner', 'admin', 'editor', 'viewer']);
      if (method === 'GET' && !targetId) return ok([...state.memberships.values()].filter((item) => item.workspaceId === workspaceId).map((item) => ({ ...item, username: state.user(item.userId).username, displayName: state.user(item.userId).displayName })));
      if (targetId && (method === 'PATCH' || method === 'DELETE')) {
        const target = state.member(workspaceId, targetId);
        if (!target) throw new ApiProblem(404, '找不到成員');
        if (state.workspace(workspaceId).kind !== 'shared' || target.role === 'owner') throw new ApiProblem(403, '無法移除或變更工作區擁有者');
        if (method === 'DELETE' && targetId === user.id) { state.memberships.delete(state.memberKey(workspaceId, targetId)); return ok({ ok: true }); }
        if (!['owner', 'admin'].includes(actor.role) || (actor.role === 'admin' && target.role === 'admin')) throw new ApiProblem(403, '沒有管理此成員的權限');
        if (method === 'DELETE') { state.memberships.delete(state.memberKey(workspaceId, targetId)); return ok({ ok: true }); }
        const role = requiredString((await body(request)).role, '角色');
        if (!['admin', 'editor', 'viewer'].includes(role) || (actor.role === 'admin' && role === 'admin')) throw new ApiProblem(403, '無法設定此角色');
        target.role = role as 'admin' | 'editor' | 'viewer';
        return ok(target);
      }
    }
    match = route.match(/^workspaces\/([^/]+)\/projects$/);
    if (match && method === 'GET') { state.requireRole(match[1], user.id, ['owner', 'admin', 'editor', 'viewer']); return ok([...state.projects.values()].filter((item) => item.workspaceId === match![1])); }
    if (match && method === 'POST') { state.requireRole(match[1], user.id, ['owner', 'admin', 'editor']); const data = await body(request); const project = { id: randomUUID(), workspaceId: match[1], createdByUserId: user.id, name: requiredString(data.name, '專案名稱'), description: typeof data.description === 'string' ? data.description.trim() : '', layoutDirection: data.layoutDirection === 'TB' ? 'TB' as const : 'LR' as const, createdAt: new Date() }; state.projects.set(project.id, project); return ok({ ...project, roomId: `project:${project.id}` }, 201); }
    match = route.match(/^projects\/([^/]+)\/files\/upload$/);
    if (match && method === 'POST') return ok(await prepareUpload(match[1], user.id, await body(request)), 201);
    match = route.match(/^files\/([^/]+)\/(complete|download)$/);
    if (match && method === 'POST' && match[2] === 'complete') return ok(await completeUpload(match[1], user.id));
    if (match && method === 'GET' && match[2] === 'download') return ok(await downloadFile(match[1], user.id));
    match = route.match(/^projects\/([^/]+)\/collaboration\/auth$/);
    if (match && method === 'POST') return ok(await authorizeCollaboration(match[1], user));
    match = route.match(/^projects\/([^/]+)\/invite-links(?:\/([^/]+))?$/);
    if (match) {
      if (method === 'GET' && !match[2]) return ok(listProjectLinks(match[1], user.id));
      if (method === 'POST' && !match[2]) return ok(createProjectLink(match[1], user.id, await body(request)), 201);
      if (method === 'DELETE' && match[2]) return ok(updateProjectLink(match[1], match[2], user.id));
      if (method === 'PATCH' && match[2]) {
        const data = await body(request);
        if (!Object.hasOwn(data, 'role')) throw new ApiProblem(400, '缺少權限');
        return ok(updateProjectLink(match[1], match[2], user.id, data.role));
      }
    }
    match = route.match(/^projects\/([^/]+)\/backups(?:\/([^/]+)\/restore)?$/);
    if (match) {
      const project = state.project(match[1]);
      state.requireRole(project.workspaceId, user.id, ['owner', 'admin']);
      try {
        if (method === 'POST' && match[2]) return ok(await restoreCanvasBackup(project.id, match[2], user.id), 201);
        if (method === 'POST' && !match[2]) return ok(await captureCanvasBackup(project.id), 201);
        if (method === 'GET' && !match[2]) return ok(await listCanvasBackups(project.id, request.nextUrl.searchParams.get('cursor') || undefined));
      } catch (error) {
        if (error instanceof ApiProblem) throw error;
        throw new ApiProblem(503, '畫布備份服務暫時無法使用，請稍後重試');
      }
    }
    match = route.match(/^projects\/([^/]+)\/canvas$/);
    if (match && collaborationEnabled()) {
      const project = state.project(match[1]);
      state.requireProjectRole(project.id, user.id, method === 'GET' ? ['owner', 'admin', 'editor', 'viewer'] : ['owner', 'admin', 'editor']);
      if (method === 'GET') return ok(await readCollaborativeCanvas(project.id));
      if (method === 'PUT') throw new ApiProblem(409, '已啟用即時共編，請重新載入新版畫布；不能以舊快照覆蓋共編內容');
    }
    if (match && method === 'GET') { const project = state.project(match[1]); state.requireProjectRole(project.id, user.id, ['owner', 'admin', 'editor', 'viewer']); return ok(state.canvasSnapshots.get(project.id) ?? { nodes: [], edges: [], convergenceNodes: [], convergenceEdges: [], resources: [], conversations: {}, summary: '', updatedAt: null }); }
    if (match && method === 'PUT') { const project = state.project(match[1]); state.requireProjectRole(project.id, user.id, ['owner', 'admin', 'editor']); const data = await body(request); const previous = state.canvasSnapshots.get(project.id); if (!Object.prototype.hasOwnProperty.call(data, 'baseUpdatedAt')) throw new ApiProblem(400, '缺少畫布版本，請重新載入頁面後再儲存'); if (Object.prototype.hasOwnProperty.call(data, 'baseUpdatedAt') && data.baseUpdatedAt !== (previous?.updatedAt.toISOString() || null)) throw new ApiProblem(409, '此畫布已被其他視窗更新，請先複製未儲存文字或匯出 PNG，再重新載入'); if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new ApiProblem(400, '畫布快照格式不正確'); const snapshot = { nodes: data.nodes, edges: data.edges, convergenceNodes: Array.isArray(data.convergenceNodes) ? data.convergenceNodes : [], convergenceEdges: Array.isArray(data.convergenceEdges) ? data.convergenceEdges : [], resources: Array.isArray(data.resources) ? data.resources : [], conversations: data.conversations && typeof data.conversations === 'object' ? data.conversations as Record<string, string[]> : {}, summary: typeof data.summary === 'string' ? data.summary : '', updatedAt: new Date(Math.max(Date.now(), (previous?.updatedAt.getTime() || 0) + 1)) }; state.canvasSnapshots.set(project.id, snapshot); return ok(snapshot); }
    match = route.match(/^projects\/([^/]+)$/);
    if (match && method === 'PATCH') {
      const project = state.project(match[1]); state.requireRole(project.workspaceId, user.id, ['owner', 'admin', 'editor']);
      const data = await body(request);
      project.name = requiredString(data.name, '專案名稱').slice(0, 255);
      if (typeof data.description === 'string') project.description = data.description.trim();
      return ok(project);
    }
    if (match && method === 'DELETE') {
      const project = state.project(match[1]); state.requireRole(project.workspaceId, user.id, ['owner', 'admin']);
      state.projects.delete(project.id); state.canvasSnapshots.delete(project.id);
      const links = new Set([...state.projectLinks.values()].filter(link => link.projectId === project.id).map(link => link.id));
      for (const id of links) state.projectLinks.delete(id);
      for (const [id, grant] of state.projectGrants) if (links.has(grant.linkId)) state.projectGrants.delete(id);
      for (const [id, document] of state.documents) if (document.projectId === project.id) state.documents.delete(id);
      return ok({ ok: true });
    }
    if (match && method === 'GET') { const project = state.project(match[1]); const role = state.requireProjectRole(project.id, user.id, ['owner', 'admin', 'editor', 'viewer']); return ok({ ...project, role, accessSource: state.member(project.workspaceId, user.id) ? 'workspace' : 'invitation', projectInvitesEnabled: projectInvitesEnabled(), roomId: `project:${project.id}`, collaborationEnabled: collaborationEnabled(), canvasBackupEnabled: canvasBackupEnabled() && collaborationEnabled() }); }
    match = route.match(/^projects\/([^/]+)\/data-zone\/structure$/);
    if (match && method === 'POST') {
      const project = state.project(match[1]); state.requireProjectRole(project.id, user.id, ['owner', 'admin', 'editor']);
      const record = state.credentials.get(user.id); if (!record) throw new ApiProblem(400, '請先在設定頁新增 Gemini API Key，才能整理 Data Zone');
      const resources = dataResources((await body(request)).resources);
      const client = new GoogleGenAI({ apiKey: decryptKey(record) });
      const sourceText = resources.map((resource, index) => `[${index + 1}] id=${resource.id}; type=${resource.kind}; title=${resource.title}; content=${resource.content ?? ''}; url=${resource.url ?? ''}`).join('\n');
      const prompt = `You structure mixed research data for a collaborative project. Reply ONLY valid JSON, no markdown. The user reads Traditional Chinese. Produce {"summary":"...","nodes":[{"label":"...","description":"...","sourceIds":["resource id"],"kind":"core|reference|insight"}],"edges":[{"source":0,"target":1,"label":"..."}]}. Nodes are a concise causal/semantic map, maximum 8. Edges use zero-based node indices. Do not invent facts.\n\nSources:\n${sourceText}`;
      try { const result = await client.models.generateContent({ model: geminiModel(), contents: prompt, config: { responseMimeType: 'application/json' } }); return ok(parseStructure(result.text ?? '', resources)); }
      catch (error) { throw geminiFailure(error, geminiModel()); }
    }

    if (route === 'admin/users' && method === 'GET') { requireAdmin(user); return ok([...state.users.values()].map((item) => ({ ...state.publicUser(item), workspaceCount: [...state.memberships.values()].filter((m) => m.userId === item.id).length, projectCount: [...state.projects.values()].filter((project) => Boolean(state.member(project.workspaceId, item.id))).length }))); }
    match = route.match(/^admin\/users\/([^/]+)\/(status|role)$/);
    if (match && method === 'PATCH') { requireAdmin(user); const target = state.user(match[1]); const data = await body(request); if (target.role === 'admin' && target.status === 'active' && (data.status === 'suspended' || data.role === 'user') && [...state.users.values()].filter((item) => item.role === 'admin' && item.status === 'active').length <= 1) throw new ApiProblem(400, '必須保留至少一位啟用中的管理員'); if (match[2] === 'status') { const status = data.status; if (status !== 'active' && status !== 'suspended') throw new ApiProblem(400, '狀態無效'); if (target.id === user.id && status === 'suspended') throw new ApiProblem(400, '不能停權自己'); target.status = status; target.tokenVersion += 1; for (const session of state.sessions.values()) if (session.userId === target.id) session.revokedAt = new Date(); } else { const role = data.role; if (role !== 'user' && role !== 'admin') throw new ApiProblem(400, '角色無效'); target.role = role; target.tokenVersion += 1; } return ok(state.publicUser(target)); }
    throw new ApiProblem(404, '找不到 API 路由');
  } catch (error) {
    if (error instanceof ApiProblem) return ok({ message: error.message }, error.status);
    console.error('API error', error instanceof Error ? error.name : 'UnknownError');
    return ok({ message: '伺服器發生錯誤' }, 500);
  }
}

function requireAdmin(user: User) { if (user.role !== 'admin') throw new ApiProblem(403, '僅限管理員'); }

async function handler(request: NextRequest, context: Context) {
  const { path } = await context.params;
  if (path.join('/') === 'health') return handleRequest(request, context);
  if (process.env.NODE_ENV === 'production' && !db) return ok({ message: '正式環境尚未設定資料庫' }, 503);
  try {
    enforceAuthRate(path.join('/'), request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local');
    return await withCollaborationLock(path.join('/'), request.method, () => state.runRequest(async () => {
      const beforeMembers = new Map([...state.memberships].map(([key, item]) => [key, { ...item }]));
      const beforeStatuses = new Map([...state.users].map(([id, item]) => [id, item.status]));
      const beforeProjects = new Set(state.projects.keys());
      const beforeLinks = new Map([...state.projectLinks].map(([id, link]) => [id, { ...link }]));
      const beforeGrants = new Map([...state.projectGrants].map(([id, grant]) => [id, { ...grant }]));
      const response = await handleRequest(request, context);
      if (!response.ok) throw new ApiProblem(response.status, (await response.json()).message);
      const affected = new Set<string>();
      const affectedProjects = new Set<string>();
      const deleted = [...beforeProjects].filter(id => !state.projects.has(id));
      if (collaborationEnabled()) {
        for (const id of new Set([...beforeLinks.keys(), ...state.projectLinks.keys()])) {
          const before = beforeLinks.get(id), after = state.projectLinks.get(id);
          if (JSON.stringify(before) !== JSON.stringify(after)) { if (before) affectedProjects.add(before.projectId); if (after) affectedProjects.add(after.projectId); }
        }
        for (const id of new Set([...beforeGrants.keys(), ...state.projectGrants.keys()])) {
          if (JSON.stringify(beforeGrants.get(id)) !== JSON.stringify(state.projectGrants.get(id))) {
            const grant = beforeGrants.get(id) || state.projectGrants.get(id)!;
            const link = beforeLinks.get(grant.linkId) || state.projectLinks.get(grant.linkId);
            if (link) affectedProjects.add(link.projectId);
          }
        }
        for (const key of new Set([...beforeMembers.keys(), ...state.memberships.keys()])) {
          const before = beforeMembers.get(key); const after = state.memberships.get(key);
          if (before?.role !== after?.role) {
            if (before) affected.add(before.workspaceId);
            if (after) affected.add(after.workspaceId);
          }
        }
        for (const [id, status] of beforeStatuses) if (state.users.get(id)?.status !== status) {
          for (const member of [...beforeMembers.values(), ...state.memberships.values()]) if (member.userId === id) affected.add(member.workspaceId);
          for (const grant of state.projectGrants.values()) if (grant.userId === id) { const link = state.projectLinks.get(grant.linkId); if (link) affectedProjects.add(link.projectId); }
        }
        // Revoke before committing; grant only after Neon confirms success.
        for (const workspaceId of affected) await syncWorkspaceRooms(workspaceId, true);
        for (const projectId of affectedProjects) {
          const project = state.projects.get(projectId);
          if (project && !affected.has(project.workspaceId)) await syncRoomPermissions(projectId, false, true);
        }
        for (const projectId of deleted) await revokeCollaborativeRoom(projectId);
      }
      await state.persist();
      if (collaborationEnabled()) {
        for (const workspaceId of affected) await syncWorkspaceRooms(workspaceId);
        for (const projectId of affectedProjects) {
          const project = state.projects.get(projectId);
          if (project && !affected.has(project.workspaceId)) await syncRoomPermissions(projectId);
        }
        for (const projectId of deleted) await deleteCollaborativeRoom(projectId);
      }
      return response;
    }));
  } catch (error) {
    if (error instanceof ApiProblem) return ok({ message: error.message }, error.status);
    console.error('Request persistence failed', error instanceof Error ? error.name : 'UnknownError');
    return ok({ message: '資料服務暫時無法儲存或讀取，請稍後重試' }, 503);
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: corsHeaders });

