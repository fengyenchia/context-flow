import { expect, test } from "@playwright/test";

for (const width of [1440, 375]) {
  test(`工作區只捲動右側內容，側欄固定（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    const workspaces = Array.from({ length: 8 }, (_, index) => ({
      id: `scroll-workspace-${index}`,
      name: `捲動測試工作區 ${index}`,
      kind: index === 0 ? "personal" : "shared",
      role: "owner",
      projectCount: 0,
      memberCount: 1,
    }));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const headers = {
        "access-control-allow-origin": "http://127.0.0.1:3100",
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      };
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers });
        return;
      }
      let body: unknown;
      if (path === "/api/auth/refresh") {
        body = {
          accessToken: "scroll-test-only",
          user: {
            id: "scroll-user",
            username: "scroll-user",
            displayName: "捲動測試",
            role: "user",
            status: "active",
            hasAiKey: false,
          },
        };
      } else if (path === "/api/workspaces") {
        body = workspaces;
      } else if (
        path === "/api/workspace-invitations" ||
        /^\/api\/workspaces\/scroll-workspace-\d+\/projects$/.test(path)
      ) {
        body = [];
      } else {
        throw new Error(`Unexpected API request: ${path}`);
      }
      await route.fulfill({ status: 200, headers, json: body });
    });
    await page.goto("/workspaces");
    await expect(
      page.getByRole("heading", { name: "工作區", exact: true }),
    ).toBeVisible();
    const main = page.locator("#main-content");
    await expect
      .poll(() =>
        main.evaluate((element) => element.scrollHeight > element.clientHeight),
      )
      .toBe(true);
    const assertDocumentStaysFixed = async () => {
      expect(
        await page.evaluate(() => ({
          y: window.scrollY,
          tooTall:
            document.documentElement.scrollHeight > window.innerHeight + 1,
          tooWide: document.documentElement.scrollWidth > window.innerWidth + 1,
        })),
      ).toEqual({ y: 0, tooTall: false, tooWide: false });
    };
    if (width >= 1024) {
      const sidebar = page.getByRole("complementary");
      const before = await sidebar.boundingBox();
      await expect(
        sidebar.getByRole("button", { name: "登出", exact: true }),
      ).toBeInViewport();
      await main.hover();
      await page.mouse.wheel(0, 900);
      await expect
        .poll(() => main.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      expect(await sidebar.boundingBox()).toEqual(before);
      await expect(
        sidebar.getByRole("button", { name: "登出", exact: true }),
      ).toBeInViewport();
      await page.getByRole("button", { name: "收合側欄", exact: true }).click();
      await expect(sidebar).toHaveCSS("width", "72px");
      await expect(
        sidebar.getByRole("button", { name: "登出", exact: true }),
      ).toBeInViewport();
    } else {
      await main.hover();
      await page.mouse.wheel(0, 900);
      await expect
        .poll(() => main.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      await expect(
        page.getByRole("button", { name: "開啟導覽", exact: true }),
      ).toBeInViewport();
      await page.getByRole("button", { name: "開啟導覽", exact: true }).click();
      await expect(
        page
          .getByRole("complementary")
          .getByRole("button", { name: "登出", exact: true }),
      ).toBeInViewport();
      await page
        .getByRole("button", { name: "關閉導覽", exact: true })
        .last()
        .click();
      await expect(page.getByRole("complementary")).toBeHidden();
    }
    await assertDocumentStaysFixed();
  });
}
