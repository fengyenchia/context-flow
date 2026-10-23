import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: '尚未登入' }) }));
  await page.goto('/');
});

test('home has complete navigation, working FAQ, registration links and footer', async ({ page }, testInfo) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /整理資料，\s*串起想法與決策。/ })).toBeVisible();
  await expect(page.getByRole('figure', { name: /畫布示意/ })).toBeVisible();
  const header = page.getByRole('navigation', { name: '主要導覽' });
  await expect(header.getByRole('link', { name: '登入', exact: true })).toHaveAttribute('href', '/login');
  await expect(header.getByRole('link', { name: '註冊', exact: true })).toHaveAttribute('href', '/register');
  await expect(page.getByRole('link', { name: '建立帳號', exact: true })).toHaveAttribute('href', '/register');
  for (const [label, id] of [['功能', 'features'], ['使用方式', 'workflow'], ['常見問題', 'faq']]) {
    await header.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }
  const question = page.getByText('一定要使用 AI 嗎？', { exact: true });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('details').first()).toHaveAttribute('open', '');
  await expect(page.getByText(/不需要。資料池、節點編輯/)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('details').first()).not.toHaveAttribute('open', '');
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByText(/© \d{4} ContextFlow/)).toBeVisible();
  await expect(footer.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/fengyenchia/context-flow');
  await expect(footer.getByRole('link', { name: '登入工作區' })).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: '開始整理專案' })).toHaveAttribute('href', '/register');
  const invalidLinks = await page.locator('main a, header a, footer a').evaluateAll(links => links.filter(link => {
    const href = link.getAttribute('href');
    return !href || href === '#' || (href.startsWith('#') && !document.getElementById(href.slice(1)));
  }).length);
  expect(invalidLinks).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true });
});

test('home fits small mobile, tablet and landscape viewports', async ({ page }, testInfo) => {
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: width === 1024 ? 600 : 900 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: '註冊', exact: true })).toBeVisible();
    if (width === 375) await page.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true });
  }
});

test('home supports dark mode, reduced motion and keyboard skip navigation', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳至主要內容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const question = page.getByText('可以匯出哪些格式？', { exact: true });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/支援分頁 PDF 與 PNG 圖片/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-dark.png'), fullPage: true });
});
