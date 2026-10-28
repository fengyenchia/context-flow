import { expect, test } from '@playwright/test';

test('manual is public, indexed, and documents the actual editing and export workflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: { message: '尚未登入' } }));
  await page.goto('/guide');
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page).toHaveTitle('使用手冊 · ContextFlow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://context-flow.fengyenchia.com/guide');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://context-flow.fengyenchia.com/guide');
  await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('使用手冊');
  const article = page.getByRole('article', { name: '操作說明' });
  await expect(article.locator('section')).toHaveCount(14);
  for (const text of ['雙擊修改標題、內容或顏色', '建立與編輯連線', '角色差異', 'PDF：用列印視窗另存', 'PNG：解壓縮後依區域閱讀']) {
    await expect(article.getByRole('heading', { name: text, exact: true })).toBeAttached();
  }
  await expect(article).toContainText('不提供 PDF 全文解析或 RAG 檢索');
  await expect(article).toContainText('不會自動合併');
  await expect(article).toContainText('不超過 20 MB');
  await expect(article).toContainText('24 小時是清理寬限期，不是復原期限');
  await expect(article).toContainText('原檔清理不會刪除這些備份副本');
  await expect(article).toContainText('右鍵拖曳經過連線也可能刪線');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳至主要內容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  const toc = page.getByRole('navigation', { name: '手冊目錄' });
  const links = toc.getByRole('link');
  await expect(links).toHaveCount(14);
  for (const link of await links.all()) {
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^#[a-z]+$/);
    await expect(page.locator(href!)).toHaveCount(1);
  }
  await toc.getByRole('link', { name: '節點：新增、雙擊編輯與分色' }).click();
  await expect(page.locator('#nodes')).toBeInViewport();
  await expect(page.locator('#nodes')).toBeFocused();
  await expect(toc.locator('a[aria-current="location"]')).toHaveAttribute('href', '#nodes');
  await expect(toc.locator('a[aria-current="location"]')).toHaveCSS('background-color', 'rgb(250, 241, 242)');
  expect(errors).toEqual([]);
});

test('manual directory follows scrolling, deep links, reloads and the final section', async ({ page }, testInfo) => {
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto('/guide');
  const current = page.getByRole('navigation', { name: '手冊目錄' }).locator('a[aria-current="location"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('href', '#start');
  for (const id of ['nodes', 'sharing', 'saving']) {
    await page.locator(`#${id}`).evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY + 160));
    await expect(current).toHaveAttribute('href', `#${id}`);
    await expect(current).toHaveCSS('background-color', 'rgb(250, 241, 242)');
  }
  await page.screenshot({ path: testInfo.outputPath('guide-active-section.png') });
  await page.goto('/guide#export');
  await expect(current).toHaveAttribute('href', '#export');
  await page.reload();
  await expect(current).toHaveAttribute('href', '#export');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(current).toHaveAttribute('href', '#troubleshooting');
  await expect(current).toBeInViewport();
});

test('manual is readable on small screens, in dark mode, and in print', async ({ page }, testInfo) => {
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/guide');
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 1024 ? 600 : 900 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const id of ['nodes', 'sharing', 'export']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow in ${id} at ${width}px`).toBe(true);
    }
    if (width === 375) await page.screenshot({ path: testInfo.outputPath('guide-mobile.png') });
  }
  await page.locator('#nodes').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('guide-desktop.png') });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('guide-dark.png') });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: '手冊目錄' })).toBeHidden();
  await expect(page.getByRole('navigation', { name: '手冊導覽' })).toBeHidden();
  await expect(page.getByRole('article')).toBeVisible();
});

for (const width of [1203, 375]) {
  test(`homepage hero opens the manual beside registration (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
    await page.goto('/');
    const hero = page.getByRole('region', { name: /整理資料，\s*串起想法與決策。/ });
    const register = hero.getByRole('link', { name: '建立帳號', exact: true });
    const manual = hero.getByRole('link', { name: '使用手冊', exact: true });
    await expect(manual).toHaveAttribute('href', '/guide');
    await expect(manual).toBeVisible();
    await expect.poll(async () => {
      const a = await register.boundingBox();
      const b = await manual.boundingBox();
      return !!a && !!b && b.x >= a.x + a.width && Math.abs(a.y - b.y) < 1 && a.height === b.height;
    }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('homepage-manual.png') });
    await register.focus();
    await page.keyboard.press('Tab');
    await expect(manual).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/guide$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('使用手冊');
  });
}

test('homepage footer opens the manual', async ({ page }) => {
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/');
  const link = page.getByRole('contentinfo').getByRole('link', { name: '使用手冊', exact: true });
  await expect(link).toHaveAttribute('href', '/guide');
  await link.click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('使用手冊');
});

for (const width of [1440, 375]) {
  test(`workspace sidebar does not include a manual entry (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/**', async route => {
      const headers = {
        'access-control-allow-origin': 'http://127.0.0.1:3100',
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/refresh') return route.fulfill({ headers, json: {
        accessToken: 'guide-test-only',
        user: { id: 'guide-user', username: 'guide-user', displayName: '手冊測試', role: 'user', status: 'active', hasAiKey: false },
      } });
      if (path === '/api/workspaces' || path === '/api/workspace-invitations' || path === '/api/shared-projects') return route.fulfill({ headers, json: [] });
      throw new Error(`Unexpected API request: ${path}`);
    });
    await page.goto('/workspaces');
    await expect(page.getByRole('heading', { name: '工作區', exact: true })).toBeVisible();
    if (width < 1024) await page.getByRole('button', { name: '開啟導覽' }).click();
    else await page.getByRole('button', { name: '收合側欄' }).click();
    const link = page.getByRole('navigation', { name: '應用程式導覽' }).getByRole('link', { name: '使用手冊', exact: true });
    await expect(link).toHaveCount(0);
  });
}
