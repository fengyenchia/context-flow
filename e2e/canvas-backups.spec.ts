import { expect, test, type Page } from '@playwright/test';
import { Y, seedDocument } from '../packages/collaboration/src/index';

async function fixture(page: Page, role = 'owner') {
  const doc = seedDocument({ nodes: [{ id: 'backup-node', position: { x: 60, y: 50 }, data: { nodeTitle: '備份節點', nodeContent: '原畫布內容' } }], edges: [] });
  const history = [{ id: `8238303999999-${'a'.repeat(64)}`, capturedAt: '2026-10-28T02:00:00.000Z', sizeBytes: 500 }];
  let restored = false; let listFails = true; let captureFails = true; let restoreFails = true; let captures = 0;
  await page.context().route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:3100', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const json = (value: unknown, status = 200) => route.fulfill({ headers, status, json: value });
    if (path === '/api/auth/refresh') return json({ user: { id: 'owner', username: 'owner', displayName: '測試帳號', role: 'user', status: 'active' }, accessToken: 'backup-fixture' });
    if (path.endsWith('/collaboration/auth')) return json({ token: 'fixture' });
    if (path.endsWith('/canvas')) return json({ nodes: [], edges: [], updatedAt: null });
    if (path.endsWith('/restore')) {
      if (restoreFails) { restoreFails = false; return json({ message: '還原暫時失敗，請重試' }, 503); }
      restored = true; return json({ id: 'restored', workspaceId: 'shared' }, 201);
    }
    if (path.endsWith('/backups')) {
      if (method === 'POST') {
        if (captureFails) { captureFails = false; return json({ message: '備份服務暫時失敗' }, 503); }
        if (captures++ > 0) return json({ ...history[0], skipped: 'unchanged' }, 201);
        history.unshift({ ...history[0], id: `8238303999998-${'b'.repeat(64)}` }); return json(history[0], 201);
      }
      if (listFails) { listFails = false; return json({ message: '無法讀取備份，請重試' }, 503); }
      return json({ backups: history, cursor: null, policy: { maxVersions: 50, maxAgeDays: 30, autoIntervalMinutes: 15 } });
    }
    if (/\/projects\/(source|restored)$/.test(path)) return json({ id: path.split('/').at(-1), workspaceId: 'shared', name: '備份專案', description: '', layoutDirection: 'LR', role, collaborationEnabled: true, canvasBackupEnabled: true });
    throw new Error(`Unexpected request ${method} ${path}`);
  });
  await page.context().routeWebSocket('**/__test-collaboration/**', socket => {
    socket.send(JSON.stringify({ hello: true, update: [...Y.encodeStateAsUpdate(doc)] }));
    socket.onMessage(data => { const update = new Uint8Array(JSON.parse(String(data)).update); Y.applyUpdate(doc, update); socket.send(JSON.stringify({ update: [...update] })); });
  });
  await page.goto('/workspaces/shared/projects/source');
  await expect(page.locator('[data-collaboration-status]')).toHaveAttribute('data-collaboration-status', 'synced', { timeout: 120_000 });
  return { restored: () => restored, close: () => doc.destroy() };
}

test('owner can retry failed operations and restore through an explicit confirmation into a new project', async ({ page }) => {
  const f = await fixture(page);
  await page.getByRole('button', { name: '畫布備份', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '畫布備份', exact: true });
  await expect(dialog.getByRole('alert')).toHaveText('無法讀取備份，請重試');
  await dialog.getByRole('button', { name: '重新整理', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '還原', exact: true })).toHaveCount(1);
  await dialog.getByRole('button', { name: '立即備份' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('備份服務暫時失敗');
  await dialog.getByRole('button', { name: '立即備份' }).click();
  await expect(dialog.getByRole('status')).toHaveText('已備份雲端畫布');
  await expect(dialog.getByRole('button', { name: '還原', exact: true })).toHaveCount(2);
  await expect(dialog.getByText('保留最近 50 份，最長 30 天；自動備份間隔至少 15 分鐘。')).toBeVisible();
  await dialog.getByRole('button', { name: '立即備份' }).click();
  await expect(dialog.getByRole('status')).toHaveText('內容未變更，沿用最近的備份');
  await expect(dialog.getByRole('button', { name: '還原', exact: true })).toHaveCount(2);
  await dialog.getByRole('button', { name: '還原', exact: true }).first().click();
  const confirmation = page.getByRole('dialog', { name: '還原備份', exact: true });
  await expect(confirmation.getByText('將在同一工作區建立新專案，原畫布保留。')).toBeVisible();
  expect(f.restored()).toBe(false);
  await page.keyboard.press('Escape');
  await expect(confirmation).not.toBeVisible();
  await expect(page.getByRole('button', { name: '畫布備份', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '畫布備份', exact: true }).click();
  await page.getByRole('button', { name: '還原', exact: true }).first().click();
  await page.getByRole('button', { name: '還原為新專案' }).click();
  await expect(page.getByRole('dialog', { name: '還原備份', exact: true }).getByRole('alert')).toHaveText('還原暫時失敗，請重試');
  await expect(page).toHaveURL(/\/projects\/source$/);
  await page.getByRole('button', { name: '還原為新專案' }).click();
  await expect(page).toHaveURL(/\/projects\/restored$/);
  expect(f.restored()).toBe(true);
  f.close();
});

test('viewer cannot see backup and restore controls', async ({ page }) => {
  const f = await fixture(page, 'viewer');
  await expect(page.getByRole('button', { name: '畫布備份', exact: true })).toHaveCount(0);
  f.close();
});
