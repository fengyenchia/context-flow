import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import JSZip from "../frontend/node_modules/jszip";

const apiURL = "http://127.0.0.1:3101/api";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO4oxHwHwAFjAJU5cX1yAAAAABJRU5ErkJggg==";

async function createFixture(page: Page, request: APIRequestContext) {
  expect((await (await request.get(`${apiURL}/health`)).json()).dataMode).toBe(
    "memory",
  );
  const username = `export_${Date.now()}`;
  const password = "Export-test-password-123!";
  expect(
    (
      await request.post(`${apiURL}/auth/register`, {
        data: {
          username,
          displayName: username,
          email: `${username}@example.test`,
          password,
        },
      })
    ).ok(),
  ).toBeTruthy();
  let token = "";
  await expect
    .poll(async () => {
      const log = await readFile(".e2e/backend.log", "utf8");
      token =
        log
          .slice(log.indexOf(`To ${username}@example.test`))
          .match(/verify-email\?token=([\w-]+)/)?.[1] || "";
      return token;
    })
    .not.toBe("");
  expect(
    (await request.get(`${apiURL}/auth/verify-email?token=${token}`)).ok(),
  ).toBeTruthy();
  const session = await request.post(`${apiURL}/auth/login`, {
    data: { username, password },
  });
  expect(session.ok()).toBeTruthy();
  await page.context().addCookies((await request.storageState()).cookies);
  expect(
    (await page.context().cookies(`${apiURL}/auth/refresh`)).some(
      (cookie) => cookie.name === "contextflow_refresh",
    ),
  ).toBeTruthy();
  const headers = {
    Authorization: `Bearer ${(await session.json()).accessToken}`,
  };
  const workspaces = await (
    await request.get(`${apiURL}/workspaces`, { headers })
  ).json();
  const created = await request.post(
    `${apiURL}/workspaces/${workspaces[0].id}/projects`,
    {
      headers,
      data: { name: "匯出圖片回歸驗收", layoutDirection: "TB" },
    },
  );
  expect(created.ok()).toBeTruthy();
  const project = await created.json();
  const url = `/workspaces/${workspaces[0].id}/projects/${project.id}`;
  return { headers, project, url, open: () => page.goto(url) };
}

test("失效圖片不阻斷 PNG ZIP 與 PDF，保留節點連線並提示缺圖", async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);
  const fixture = await createFixture(page, request);
  const missing =
    "blob:http://127.0.0.1:3100/00000000-0000-4000-8000-000000000000";
  const node = (id: string, imageUrl: string, x: number, y: number) => ({
    id,
    position: { x, y },
    data: {
      nodeKind: "image",
      nodeTitle: id,
      nodeContent: "匯出回歸內容",
      imageUrl,
      nodeColor: "#bfe3d2",
    },
    style: { width: 220, background: "#bfe3d2" },
  });
  expect(
    (
      await request.put(`${apiURL}/projects/${fixture.project.id}/canvas`, {
        headers: fixture.headers,
        data: {
          baseUpdatedAt: null,
          nodes: [
            node("失效本機圖片", missing, -50, 20),
            node("有效本機圖片", `data:image/png;base64,${png}`, 280, 20),
            node("diverge-失效圖片", missing, 20, 20),
          ],
          edges: [
            {
              id: "export-edge",
              source: "失效本機圖片",
              target: "有效本機圖片",
              label: "關係保留",
              style: { stroke: "#d97887" },
            },
          ],
          convergenceNodes: [
            node("converge-損壞圖片", "data:image/png;base64,invalid", 20, 20),
          ],
          convergenceEdges: [],
          resources: [
            {
              id: "source",
              kind: "text",
              title: "資料池標題",
              content: "資料池內容",
            },
          ],
          conversations: {},
          summary: "",
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = "true";
    };
  });
  await fixture.open();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  // Presence belongs only to the live view. Observe the actual export clones
  // used for both PNG and PDF, rather than relying on hidden CSS.
  await page.evaluate(() => {
    const marker = document.createElement('div');
    marker.dataset.collaborationPresence = '';
    marker.textContent = 'REMOTE_CURSOR_EXPORT_SENTINEL';
    document.querySelector('.react-flow__viewport')!.append(marker);
    document.documentElement.dataset.presenceLeaked = 'false';
    document.documentElement.dataset.exportFrames = '0';
    new MutationObserver(() => {
      const stage = document.querySelector('[data-export-stage]');
      if (stage?.querySelector('.react-flow__node')) {
        document.documentElement.dataset.exportFrames = String(Number(document.documentElement.dataset.exportFrames) + 1);
        if (stage.querySelector('[data-collaboration-presence]') || stage.textContent?.includes('REMOTE_CURSOR_EXPORT_SENTINEL')) document.documentElement.dataset.presenceLeaked = 'true';
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  // Reproduce the underlying pre-fix failure: html-to-image rejects an Event
  // when a cloned image's persisted blob URL is no longer available.
  await page.addScriptTag({
    path: "frontend/node_modules/html-to-image/dist/html-to-image.js",
  });
  const baseline = await page.evaluate(async (source) => {
    const root = document.createElement("div");
    const image = document.createElement("img");
    image.src = source;
    root.append(image);
    document.body.append(root);
    try {
      const renderer = (
        window as unknown as {
          htmlToImage: { toPng: (node: HTMLElement) => Promise<string> };
        }
      ).htmlToImage;
      await renderer.toPng(root);
      return { failed: false, isError: false };
    } catch (reason) {
      return { failed: true, isError: reason instanceof Error };
    } finally {
      root.remove();
    }
  }, missing);
  expect(baseline).toEqual({ failed: true, isError: false });
  const liveBefore = await page
    .locator(".react-flow__viewport")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("style")));
  const downloaded = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: "匯出 PNG", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/-PNG.zip$/);
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const images = Object.keys(zip.files).filter((name) => name.endsWith(".png"));
  expect(images).toHaveLength(4);
  expect(await zip.file("圖片警告.txt")!.async("string")).toContain(
    "請重新上傳原圖",
  );
  await mkdir("output/screenshots", { recursive: true });
  for (const name of images) {
    const bytes = await zip.file(name)!.async("nodebuffer");
    expect(bytes.readUInt32BE(16)).toBe(1500);
    expect(bytes.readUInt32BE(20)).toBe(1041);
    if (name.includes("資料架構區")) {
      await writeFile("output/screenshots/export-recovered-zone.png", bytes);
      const pixels = await page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const rgba = context.getImageData(
          0,
          80,
          image.width,
          image.height - 80,
        ).data;
        let green = 0;
        let ink = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          if (rgba[i] < 210 && rgba[i + 1] > 210 && rgba[i + 2] > 195) green++;
          if (rgba[i] < 100 && rgba[i + 1] < 100 && rgba[i + 2] < 100) ink++;
        }
        return { green, ink };
      }, bytes.toString("base64"));
      expect(pixels.green).toBeGreaterThan(1000);
      expect(pixels.ink).toBeGreaterThan(100);
    }
  }
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "已完成匯出；部分圖片無法載入" }),
  ).toBeVisible();
  await expect(page.locator("[data-export-stage]")).toHaveCount(0);
  expect(
    await page
      .locator(".react-flow__viewport")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("style"))),
  ).toEqual(liveBefore);
  await expect(
    page.locator('.react-flow__node[data-id="失效本機圖片"] img'),
  ).toHaveAttribute("src", missing);
  await page.getByRole("button", { name: "匯出 PDF", exact: true }).click();
  const frame = page.frameLocator('iframe[title="PDF 列印預覽"]');
  await expect(frame.locator("html")).toHaveAttribute(
    "data-print-requested",
    "true",
    { timeout: 90_000 },
  );
  await expect(frame.locator("section")).toHaveCount(4);
  const printHtml = await frame
    .locator("html")
    .evaluate((element) => element.outerHTML);
  const pdfPage = await page.context().newPage();
  await pdfPage.setContent(printHtml);
  await pdfPage
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
    );
  await mkdir("output/pdf", { recursive: true });
  await pdfPage.pdf({
    path: "output/pdf/export-recovered.pdf",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await pdfPage.close();
  await expect(page.locator("[data-export-stage]")).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-presence-leaked', 'false');
  expect(Number(await page.locator('html').getAttribute('data-export-frames'))).toBeGreaterThan(1);
  await expect(page.getByText('REMOTE_CURSOR_EXPORT_SENTINEL', { exact: true })).toHaveCount(1);
});

test("本機圖片保存實際內容，重載後仍可 PNG 與 PDF 匯出", async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);
  const fixture = await createFixture(page, request);
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = "true";
    };
  });
  await fixture.open();
  await page
    .locator('[data-canvas-area="zone"]')
    .getByRole("button", { name: "圖片節點", exact: true })
    .click();
  await page.getByLabel("標題", { exact: true }).fill("不再失效的本機圖片");
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "local.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(page.getByLabel("圖片連結", { exact: true })).toHaveValue(
    /^data:image\/png;base64,/,
  );
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/projects/${fixture.project.id}/canvas`) &&
      response.request().method() === "PUT" &&
      response
        .request()
        .postDataJSON()
        ?.nodes?.some((node: { data?: { imageUrl?: string } }) =>
          node.data?.imageUrl?.startsWith("data:image/png;base64,"),
        ) &&
      response.ok(),
  );
  await page.getByRole("button", { name: "新增節點", exact: true }).click();
  await saved;
  await page.reload();
  const image = page.locator(".react-flow__node img");
  await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
  expect(
    await image.evaluate((element) =>
      (element as HTMLImageElement)
        .decode()
        .then(() => (element as HTMLImageElement).naturalWidth),
    ),
  ).toBe(1);
  const downloaded = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: "匯出 PNG", exact: true }).click();
  const zip = await JSZip.loadAsync(
    await readFile((await (await downloaded).path())!),
  );
  expect(
    Object.keys(zip.files).filter((name) => name.endsWith(".png")),
  ).toHaveLength(4);
  expect(zip.file("圖片警告.txt")).toBeNull();
  await page.getByRole("button", { name: "匯出 PDF", exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="PDF 列印預覽"]').locator("html"),
  ).toHaveAttribute("data-print-requested", "true", { timeout: 90_000 });
  await expect(
    page.getByRole("status").filter({ hasText: "部分圖片無法載入" }),
  ).toHaveCount(0);
});
