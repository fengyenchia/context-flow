import { test, expect } from '@playwright/test';

test('精簡首頁與登入頁在桌機和手機保留必要操作', async ({ page }) => {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '整理資料、討論與決策' })).toBeVisible();
    await expect(page.getByText('Collaborative context canvas', { exact: true })).toHaveCount(0);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '登入', exact: true })).toBeVisible();
    await expect(page.getByLabel('帳號', { exact: true })).toBeVisible();
    await expect(page.getByLabel('密碼', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '登入 ContextFlow' })).toBeVisible();
    await expect(page.getByText('Think together, clearly', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: `.e2e/login-simplified-${width}.png`, fullPage: true });
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: '註冊', exact: true })).toBeVisible();
    await expect(page.getByText('註冊後請至信箱完成驗證。')).toBeVisible();
    await expect(page.getByRole('button', { name: '建立帳號', exact: true })).toBeVisible();
  }
});
