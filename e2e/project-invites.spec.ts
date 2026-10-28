import { expect, test, type Browser, type BrowserContext, type WebSocketRoute } from '@playwright/test';
import { Y, seedDocument, readSnapshot } from '../packages/collaboration/src/index';

async function fixture(browser: Browser) {
  const doc = seedDocument({ nodes: [{ id: 'invite-node', position: { x: 60, y: 60 }, data: { nodeTitle: '邀請節點', nodeContent: '原內容' } }], edges: [] });
  const token = 'T'.repeat(43), linkId = 'fixture-link';
  const url = `/workspaces/source-workspace/projects/shared-project`;
  const sockets = new Set<WebSocketRoute>(), contexts: BrowserContext[] = [];
  let created = false, accepted = false, revoked = false, failAccept = true, role = 'viewer';
  async function client(name: string) {
    let loggedIn = name === 'owner';
    const context = await browser.newContext(); contexts.push(context);
    await context.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
      expect(request.url()).not.toContain(token);
      const headers = { 'access-control-allow-origin': 'http://127.0.0.1:3100', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
      const json = (body: unknown, status = 200) => route.fulfill({ headers, status, json: body });
      if (method === 'OPTIONS') return route.fulfill({ headers, status: 204 });
      const user = { id: name, username: name, displayName: name, role: 'user', status: 'active', hasAiKey: false };
      if (path === '/api/auth/refresh') return loggedIn ? json({ accessToken: `fixture-${name}`, user }) : json({ message: '尚未登入' }, 401);
      if (path === '/api/auth/login') { loggedIn = true; return json({ accessToken: `fixture-${name}`, user }); }
      if (path === '/api/project-invitations/preview') return !revoked && created && request.postDataJSON().token === token ? json({ name: '限定專案', role, expiresAt: new Date(Date.now() + 86400_000).toISOString() }) : json({ message: '邀請連結無效、已到期或已撤銷' }, 410);
      if (path === '/api/project-invitations/accept') {
        if (failAccept) { failAccept = false; return json({ message: '資料暫時無法儲存，請重試' }, 503); }
        if (revoked) return json({ message: '邀請連結已撤銷' }, 410);
        accepted = true; return json({ id: 'shared-project', workspaceId: 'source-workspace' });
      }
      const project = { id: 'shared-project', workspaceId: 'source-workspace', name: '限定專案', description: '', role: name === 'owner' ? 'owner' : role, accessSource: name === 'owner' ? 'workspace' : 'invitation', layoutDirection: 'LR', collaborationEnabled: true, projectInvitesEnabled: true };
      const link = { id: linkId, role, expiresAt: new Date(Date.now() + 86400_000).toISOString(), createdAt: '2026-10-28T01:00:00.000Z', revokedAt: revoked ? new Date().toISOString() : null, joinedCount: accepted ? 1 : 0 };
      if (path.includes('/invite-links')) {
        expect(name).toBe('owner');
        if (method === 'POST') { created = true; role = request.postDataJSON().role; return json({ ...link, role, url: `http://127.0.0.1:3100/project-invite#${token}` }, 201); }
        if (method === 'PATCH') { role = request.postDataJSON().role; return json({ ...link, role }); }
        if (method === 'DELETE') { revoked = true; return json({ ...link, revokedAt: new Date().toISOString() }); }
        return json(created ? [link] : []);
      }
      if (path === '/api/projects/shared-project' || path.endsWith('/canvas') || path.endsWith('/collaboration/auth')) {
        if (name !== 'owner' && (!accepted || revoked)) return json({ message: '沒有此專案權限' }, 403);
        if (path.endsWith('/canvas')) return json({ ...readSnapshot(doc), updatedAt: null });
        return path.endsWith('/collaboration/auth') ? json({ token: 'fixture' }) : json(project);
      }
      if (path === '/api/workspaces') return json([{ id: name === 'owner' ? 'source-workspace' : 'personal-guest', name: name === 'owner' ? '來源工作區' : '我的工作區', kind: 'personal', role: 'owner', memberCount: 1, projectCount: name === 'owner' ? 1 : 0 }]);
      if (path === '/api/shared-projects') return json(name !== 'owner' && accepted && !revoked ? [project] : []);
      if (path === '/api/workspace-invitations') return json([]);
      if (path === '/api/workspaces/personal-guest/projects') return json([]);
      if (path === '/api/workspaces/source-workspace/projects') { expect(name).toBe('owner'); return json([project]); }
      throw new Error(`Unexpected API request ${method} ${path}`);
    });
    await context.routeWebSocket('**/__test-collaboration/**', socket => {
      sockets.add(socket); socket.send(JSON.stringify({ hello: true, update: [...Y.encodeStateAsUpdate(doc)] }));
      socket.onMessage(data => { if (name !== 'owner' && (role !== 'editor' || revoked)) return; const update = new Uint8Array(JSON.parse(String(data)).update); Y.applyUpdate(doc, update); for (const peer of sockets) peer.send(JSON.stringify({ update: [...update] })); });
      socket.onClose(() => sockets.delete(socket));
    });
    return context.newPage();
  }
  return { client, url, token, linkId, revoke: () => { revoked = true; }, create: () => { created = true; }, close: async () => { for (const context of contexts) await context.close(); doc.destroy(); } };
}

test('owner shares one project, guest logs in and accepts, then role changes and revocation affect the open canvas', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const owner = await f.client('owner'); await owner.goto(f.url);
    await owner.getByRole('button', { name: '分享專案', exact: true }).click();
    const share = owner.getByRole('dialog', { name: '分享專案', exact: true });
    await share.getByRole('button', { name: '建立邀請連結' }).click();
    const link = await share.getByRole('textbox', { name: '邀請連結', exact: true }).inputValue();
    expect(link).toContain(`/project-invite#${f.token}`);
    await expect(share.getByText('到期後停止新的人加入；已加入的人保留權限，直到撤銷連結。')).toBeVisible();
    await owner.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(share).toBeVisible();
    await share.getByRole('button', { name: '關閉視窗', exact: true }).click();
    const guest = await f.client('guest'); await guest.goto(link);
    await expect(guest).toHaveURL(/\/project-invite$/);
    await guest.getByRole('link', { name: '登入並繼續' }).click();
    await expect(guest.getByRole('button', { name: '登入 ContextFlow', exact: true })).toBeVisible({ timeout: 60_000 });
    await guest.getByLabel('帳號', { exact: true }).fill('guest'); await guest.getByLabel('密碼', { exact: true }).fill('fixture-password');
    await guest.getByRole('button', { name: '登入 ContextFlow' }).click();
    await expect(guest.getByRole('heading', { name: '限定專案' })).toBeVisible();
    await guest.getByRole('button', { name: '接受邀請' }).click();
    await expect(guest.getByRole('alert').filter({ hasText: '資料暫時無法儲存' })).toBeVisible();
    await guest.getByRole('button', { name: '接受邀請' }).click();
    await expect(guest).toHaveURL(new RegExp(f.url + '$'));
    await expect(guest.locator('[data-collaboration-status]')).toHaveAttribute('data-collaboration-status', 'synced');
    await expect(guest.getByRole('button', { name: '分享專案', exact: true })).toHaveCount(0);
    await expect(guest.locator('[data-tour="node-toolbar-zone"]')).toHaveCount(0);
    await guest.goto('/workspaces');
    await expect(guest.getByRole('region', { name: '受邀專案' })).toContainText('限定專案');
    await expect(guest.getByText('來源工作區', { exact: true })).toHaveCount(0);
    await guest.getByRole('link').filter({ has: guest.getByRole('heading', { name: '限定專案' }) }).click();
    await owner.getByRole('button', { name: '分享專案', exact: true }).click();
    await share.getByRole('combobox', { name: `連結權限 ${f.linkId}` }).selectOption('editor');
    await guest.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(guest.locator('[data-tour="node-toolbar-zone"]')).toBeVisible();
    await guest.locator('.react-flow__node[data-id="invite-node"]').getByText('邀請節點', { exact: true }).dblclick();
    await guest.getByRole('dialog', { name: '編輯節點', exact: true }).getByLabel('內容', { exact: true }).fill('受邀者修改');
    await guest.getByRole('button', { name: '儲存變更', exact: true }).click();
    await expect(owner.locator('.react-flow__node[data-id="invite-node"]')).toContainText('受邀者修改');
    await share.getByRole('button', { name: '撤銷', exact: true }).click();
    await owner.getByRole('dialog', { name: '撤銷邀請連結', exact: true }).getByRole('button', { name: '確定撤銷' }).click();
    await guest.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(guest.getByRole('alert').filter({ hasText: '專案存取權限已變更' })).toBeVisible();
    await expect(guest.locator('.react-flow__node')).toHaveCount(0);
  } finally { await f.close(); }
});

test('invalid or revoked links do not show project content or an accept button', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const page = await f.client('owner'); f.create(); f.revoke();
    await page.goto(`/project-invite#${f.token}`);
    await expect(page.getByRole('alert').filter({ hasText: '邀請連結無效、已到期或已撤銷' })).toBeVisible();
    await expect(page.getByRole('button', { name: '接受邀請' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '限定專案' })).toHaveCount(0);
  } finally { await f.close(); }
});
