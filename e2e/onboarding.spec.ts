import { expect, test, type Page } from '@playwright/test';

const user = { id: 'onboarding-user', username: 'onboarding-user', displayName: '教學測試', role: 'user', status: 'active', hasAiKey: false };
const key = `contextflow:onboarding:v1:${user.id}`;
const canvasUrl = '/workspaces/tour-workspace/projects/tour-project';

async function fixture(page: Page, options: { registered?: boolean; viewer?: boolean; pending?: boolean; canvasPending?: boolean } = {}) {
  let loggedIn = !options.registered;
  const role = options.viewer ? 'viewer' : 'owner';
  const project = { id: 'tour-project', workspaceId: 'tour-workspace', name: '教學專案', description: '測試畫布', layoutDirection: 'LR', role };
  let snapshot = { nodes: [], edges: [], convergenceNodes: [], convergenceEdges: [], resources: [], conversations: {}, summary: '', updatedAt: null as string | null };
  const requests: string[] = [];
  if (options.pending || options.canvasPending) await page.addInitScript(({ key, canvasPending }) => {
    // Set only once; a reload must keep completion/skip state written by the app.
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ pending: true, ...(canvasPending ? { workspace: 'finished' } : {}) }));
  }, { key, canvasPending: options.canvasPending });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:3100', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    requests.push(`${method} ${path}`);
    let body: unknown;
    if (path === '/api/auth/register') body = { user, emailVerificationSent: true };
    else if (path === '/api/auth/login') { loggedIn = true; body = { user, accessToken: 'tour-test-only' }; }
    else if (path === '/api/auth/refresh') {
      if (!loggedIn) return route.fulfill({ status: 401, headers, json: { message: '尚未登入' } });
      body = { user, accessToken: 'tour-test-only' };
    } else if (path === '/api/workspaces') body = [{ id: 'tour-workspace', name: '個人工作區', kind: 'personal', role, projectCount: 1, memberCount: 1 }];
    else if (path === '/api/workspace-invitations') body = [];
    else if (path === '/api/workspaces/tour-workspace/projects') body = [project];
    else if (path === '/api/projects/tour-project') body = project;
    else if (path === '/api/projects/tour-project/canvas') {
      if (method === 'PUT') snapshot = { ...route.request().postDataJSON(), updatedAt: new Date().toISOString() };
      body = snapshot;
    } else throw new Error(`Unexpected tour request: ${method} ${path}`);
    await route.fulfill({ headers, json: body });
  });
  return { requests, snapshot: () => snapshot };
}

async function finish(page: Page, titles: string[]) {
  for (const [index, title] of titles.entries()) {
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(dialog.locator('[title]')).toHaveCount(0);
    await expect(dialog.locator('a[href="/guide"]')).toHaveCount(index === titles.length - 1 ? 1 : 0);
    await dialog.getByRole('button', { name: index === titles.length - 1 ? '完成教學' : '下一步', exact: true }).click();
  }
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

const workspaceTitles = ['從工作區開始', '建立第一個專案', '需要團隊協作時', '隨時重看教學'];
const canvasTitles = ['先放入資料', '新增與雙擊編輯節點', '移動節點與建立連線', '在這裡發散想法', '用 AI 延伸思考', '從發散整理成結論', '等「已儲存」再離開', '匯出 PDF 或 PNG', '開始整理你的畫布'];

test('registration arms onboarding; workspace completion continues into the first canvas without changing data', async ({ page }, testInfo) => {
  // Next dev may cold-compile both auth and canvas routes on a memory-constrained host.
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const mock = await fixture(page, { registered: true });
  await page.goto('/register');
  await page.getByLabel('顯示名稱', { exact: true }).fill('教學測試');
  await page.getByLabel('Email', { exact: true }).fill('tour@example.test');
  await page.getByLabel('帳號', { exact: true }).fill('onboarding-user');
  await page.getByLabel('密碼', { exact: true }).fill('Tour-test-password!');
  await page.getByRole('button', { name: '建立帳號', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 120_000 });
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').pending, key)).toBe(true);
  await page.getByLabel('帳號', { exact: true }).fill('onboarding-user');
  await page.getByLabel('密碼', { exact: true }).fill('Tour-test-password!');
  await page.getByRole('button', { name: '登入 ContextFlow' }).click();
  await expect(page).toHaveURL(/\/workspaces$/, { timeout: 120_000 });
  await finish(page, workspaceTitles);
  await page.getByRole('link', { name: /教學專案/ }).first().click();
  await expect(page).toHaveURL(canvasUrl, { timeout: 120_000 });
  await expect(page.getByRole('heading', { name: canvasTitles[0], exact: true })).toBeVisible();
  await expect(page.locator('.react-joyride__floater')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('tour-desktop.png') });
  await finish(page, canvasTitles);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), key);
  expect(stored).toMatchObject({ workspace: 'finished', canvas: 'finished' });
  expect(mock.snapshot().nodes).toEqual([]);
  expect(mock.snapshot().resources).toEqual([]);
  expect(mock.requests.some(request => /ai\/|data-zone\/structure|files\//.test(request))).toBe(false);
  await page.reload();
  await expect(page.getByRole('button', { name: '新手教學', exact: true })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: '新手教學', exact: true }).click();
  await expect(page.getByRole('heading', { name: '先放入資料', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新手教學', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('skip is remembered, cancels automatic follow-up, and replay supports back and close', async ({ page }) => {
  await fixture(page, { pending: true });
  await page.goto('/workspaces');
  await page.getByRole('button', { name: '跳過教學', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: '工作區', exact: true })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: '新手教學', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: workspaceTitles[1], exact: true })).toBeVisible();
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: workspaceTitles[0], exact: true })).toBeVisible();
  await page.getByRole('button', { name: '關閉教學', exact: true }).click();
  await page.goto(canvasUrl);
  await expect(page.getByRole('button', { name: '新手教學', exact: true })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('canvas replay expands collapsed panels and an existing user is not auto-enrolled', async ({ page }) => {
  await fixture(page);
  await page.goto(canvasUrl);
  await expect(page.getByRole('button', { name: '新手教學', exact: true })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: '收合資料架構區', exact: true }).click();
  await page.getByRole('button', { name: '新手教學', exact: true }).click();
  await finish(page, canvasTitles);
});

test('mobile and dark/reduced-motion onboarding stays readable and keyboard dismissible', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await fixture(page, { canvasPending: true });
  await page.goto(canvasUrl);
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: canvasTitles[0], exact: true })).toBeVisible();
  await expect(dialog).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const canvas of await page.locator('.react-flow').all()) {
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  }
  await page.screenshot({ path: testInfo.outputPath('tour-mobile-dark.png') });
  await finish(page, canvasTitles);
});

test('viewer is not auto-enrolled and can replay a read-only introduction', async ({ page }) => {
  await fixture(page, { viewer: true, canvasPending: true });
  await page.goto(canvasUrl);
  await expect(page.getByRole('button', { name: '新手教學', exact: true })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: '新手教學', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('僅檢視');
  await page.getByRole('button', { name: '跳過教學', exact: true }).click();
});
