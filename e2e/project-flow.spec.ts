import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import JSZip from "../frontend/node_modules/jszip";

const apiURL = "http://127.0.0.1:3101/api";
const password = "E2e-password-123!";

async function registerAndVerify(page: Page) {
  const username = `e2e_${Date.now()}`;
  const email = `${username}@example.test`;
  await page.goto("/register");
  await page.getByLabel("顯示名稱", { exact: true }).fill(username);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("帳號", { exact: true }).fill(username);
  await page.getByLabel("密碼", { exact: true }).fill(password);
  const registered = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/register") &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.getByRole("button", { name: "建立帳號" }).click();
  expect((await registered).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/login$/, { timeout: 60_000 });
  let link = "";
  await expect
    .poll(async () => {
      const log = await readFile(".e2e/backend.log", "utf8");
      const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      link =
        log.match(
          new RegExp(
            `To ${escaped}\\s+[\\s\\S]*?(http://127\\.0\\.0\\.1:3100/verify-email\\?token=[\\w-]+)`,
          ),
        )?.[1] || "";
      return link;
    })
    .not.toBe("");
  await page.goto(link);
  await expect(page.getByRole("status")).toContainText(/Email 已(完成)?驗證/);
  return username;
}

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("帳號", { exact: true }).fill(username);
  await page.getByLabel("密碼", { exact: true }).fill(password);
  const authenticated = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "登入 ContextFlow" }).click();
  expect((await authenticated).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/workspaces$/, { timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: "工作區", exact: true }),
  ).toBeVisible();
}

async function accessToken(request: APIRequestContext, username: string) {
  const response = await request.post(`${apiURL}/auth/login`, {
    data: { username, password },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).accessToken as string;
}

test("註冊驗證、登入、個人/共享工作區、專案、三區節點儲存與重載、匯出及登出", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  // This scenario includes cold compilation, >20 PNG tiles, PDF generation,
  // offline retry and two-tab conflicts. Keep individual action waits bounded.
  test.slow();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /change in the order of Hooks|synchronously unmount|createRoot|createPortal/i.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().startsWith(apiURL) && response.status() >= 500)
      errors.push(`${response.status()} ${response.url()}`);
  });
  const health = await (await request.get(`${apiURL}/health`)).json();
  expect(health.dataMode).toBe("memory");
  expect(health.integrations.neon).toBe(false);
  const username = await registerAndVerify(page);
  await login(page, username);
  await expect(page.getByText("Workspace overview", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Project thinking", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "開啟帳號選單" })).toHaveCount(0);
  await page.screenshot({ path: ".e2e/workspace-simplified.png", fullPage: true });
  for (const [path, title] of [
    ["/settings/account", "帳號設定"],
    ["/settings/ai", "AI Key"],
    ["/settings/security", "密碼與安全性"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await page.goto("/workspaces");
  await expect(
    page.getByRole("heading", { name: `${username} 的工作區` }),
  ).toBeVisible();
  await expect(page.getByText("個人", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新增專案", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "新增專案", exact: true }),
  ).toBeVisible();
  await page.getByLabel("專案名稱", { exact: true }).fill("E2E 個人專案");
  await page.getByLabel("說明", { exact: true }).fill("驗證個人區可建立專案");
  await page.getByRole("button", { name: "建立", exact: true }).click();
  await expect(page.getByRole("link", { name: /E2E 個人專案/ })).toBeVisible();
  const personalProject = page.getByRole("article", {
    name: "E2E 個人專案",
    exact: true,
  });
  await personalProject
    .getByRole("button", { name: "編輯專案", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "編輯專案", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("專案名稱", { exact: true })).toHaveValue(
    "E2E 個人專案",
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await personalProject
    .getByRole("button", { name: "刪除專案", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "刪除專案", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "確定刪除", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "新增共享工作區" }).click();
  await expect(
    page.getByRole("dialog", { name: "建立共享工作區", exact: true }),
  ).toBeVisible();
  await page.getByLabel("工作區名稱").fill("E2E 共享工作區");
  await page.getByRole("button", { name: "建立", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "E2E 共享工作區" }),
  ).toBeVisible();
  const workspaceRegion = page.getByRole("region", {
    name: "E2E 共享工作區",
    exact: true,
  });
  const membersTrigger = workspaceRegion.getByRole("button", {
    name: "查看成員",
    exact: true,
  });
  // Opening feedback must be immediate, even while the member request is slow.
  let releaseMembers!: () => void;
  const delayedMembers = new Promise<void>((resolve) => {
    releaseMembers = resolve;
  });
  await page.route("**/api/workspaces/*/members", async (route) => {
    await delayedMembers;
    await route.continue();
  });
  await membersTrigger.click();
  const membersDialog = page.getByRole("dialog", {
    name: "工作區成員",
    exact: true,
  });
  await expect(membersDialog).toBeVisible();
  await expect(membersDialog.getByRole("status")).toHaveText("正在載入成員…");
  expect(
    await membersDialog.evaluate((element) => element.matches(":modal")),
  ).toBeTruthy();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(
      await membersDialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBeTruthy();
  }
  await page.keyboard.press("Escape");
  await expect(membersDialog).toHaveCount(0);
  await expect(membersTrigger).toBeFocused();
  const releasedResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/members") &&
      response.request().method() === "GET",
  );
  releaseMembers();
  await releasedResponse;
  await page.unrouteAll({ behavior: "wait" });
  await membersTrigger.click();
  await expect(
    membersDialog.getByRole("list", { name: "成員清單" }),
  ).toContainText(username);
  await expect(membersDialog).toContainText("擁有者");
  await page.screenshot({ path: ".e2e/workspace-members-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDialog = await membersDialog.boundingBox();
  expect(mobileDialog!.x).toBeGreaterThanOrEqual(12);
  expect(mobileDialog!.x + mobileDialog!.width).toBeLessThanOrEqual(378);
  expect(mobileDialog!.height).toBeLessThanOrEqual(820);
  await page.screenshot({ path: ".e2e/workspace-members-mobile.png" });
  await membersDialog
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await expect(membersTrigger).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Errors belong inside the visible modal, with a local retry action.
  await page.route("**/api/workspaces/*/members", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ message: "測試成員讀取失敗" }),
    }),
  );
  await membersTrigger.click();
  await expect(membersDialog.getByRole("alert")).toContainText(
    "測試成員讀取失敗",
  );
  await page.unroute("**/api/workspaces/*/members");
  await membersDialog
    .getByRole("button", { name: "重新載入", exact: true })
    .click();
  await expect(
    membersDialog.getByRole("list", { name: "成員清單" }),
  ).toContainText(username);
  await membersDialog
    .getByRole("button", { name: "關閉視窗", exact: true })
    .click();
  await workspaceRegion
    .getByRole("button", { name: "邀請", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "邀請成員", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("受邀帳號", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "新增專案", exact: true })
    .last()
    .click();
  await page.getByLabel("專案名稱", { exact: true }).fill("E2E 畫布專案");
  await page.getByLabel("說明", { exact: true }).fill("三區畫布整合驗證");
  await page.getByRole("button", { name: "建立", exact: true }).click();
  await page.getByRole("link", { name: /E2E 畫布專案/ }).click();
  await expect(page).toHaveURL(/\/workspaces\/[^/]+\/projects\/[^/]+$/, {
    timeout: 90_000,
  });
  await expect(page.locator(".react-flow")).toHaveCount(3);
  const projectURL = page.url();
  const projectId = projectURL.split("/").pop();
  await page.getByPlaceholder("資料標題").fill("E2E 來源");
  await page.getByPlaceholder("貼上筆記或文字…").fill("這是測試資料池內容");
  await page.getByRole("button", { name: "加入資料池" }).click();
  await expect(page.getByText("E2E 來源", { exact: true })).toBeVisible();
  for (const area of ["zone", "zone2", "diverge", "converge"]) {
    const canvasArea = area === "zone2" ? "zone" : area;
    await page
      .locator(`[data-canvas-area="${canvasArea}"]`)
      .getByRole("button", { name: "文字節點", exact: true })
      .click();
    await page.getByLabel("標題", { exact: true }).fill(`${area} 節點`);
    await page
      .getByLabel("內容", { exact: true })
      .fill(`${area} 完整內容，重載後仍應保留。`);
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/projects/${projectId}/canvas`) &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    await page.getByRole("button", { name: "新增節點", exact: true }).click();
    await expect(
      page
        .locator(`[data-canvas-area="${canvasArea}"] .react-flow__node`)
        .getByText(`${area} 節點`, { exact: true }),
    ).toBeVisible();
    await saved;
    // Exercise real double-click events, not synthetic application events.
    const node = page
      .locator(`[data-canvas-area="${canvasArea}"] .react-flow__node`)
      .filter({ hasText: `${area} 節點` });
    await node.getByText(`${area} 節點`, { exact: true }).dblclick();
    await expect(
      page.getByRole("dialog", { name: "編輯節點", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "編輯連線文字" }),
    ).toHaveCount(0);
    await page.getByLabel("內容", { exact: true }).fill(`${area} 已編輯內容`);
    if (area === "zone") {
      for (const [name, background] of [
        ["粉紅", "rgb(242, 198, 210)"],
        ["奶油", "rgb(244, 213, 141)"],
        ["薄荷", "rgb(191, 227, 210)"],
        ["薰衣草", "rgb(215, 200, 238)"],
        ["天藍", "rgb(191, 216, 243)"],
        ["白色", "rgb(255, 255, 255)"],
      ]) {
        const swatch = page.getByRole("button", { name, exact: true });
        await expect(swatch.locator("span").first()).toHaveCSS(
          "background-color",
          background,
        );
      }
    }
    await page.getByRole("button", { name: "薄荷", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "薄荷", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("node-color-preview")).toHaveCount(0);
    if (area === "zone") {
      await mkdir("output/screenshots", { recursive: true });
      await page
        .getByRole("dialog", { name: "編輯節點", exact: true })
        .screenshot({ path: "output/screenshots/node-color-picker.png" });
    }
    const updated = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/projects/${projectId}/canvas`) &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    await page.getByRole("button", { name: "儲存變更", exact: true }).click();
    await updated;
    await expect(node).toHaveCSS("background-color", "rgb(191, 227, 210)");
  }
  // Inspect saved data through the real API, then reload through cookie refresh.
  const token = await accessToken(request, username);
  const headers = { Authorization: `Bearer ${token}` };
  const snapshot = await (
    await request.get(`${apiURL}/projects/${projectId}/canvas`, { headers })
  ).json();
  expect(snapshot.nodes).toHaveLength(3);
  expect(snapshot.convergenceNodes).toHaveLength(1);
  expect(snapshot.resources).toHaveLength(1);
  expect(
    snapshot.nodes.every(
      (node: { data: { nodeContent: string; nodeColor: string } }) =>
        node.data.nodeContent.includes("已編輯內容") &&
        node.data.nodeColor === "#bfe3d2",
    ),
  ).toBeTruthy();
  expect(snapshot.convergenceNodes[0].data.nodeColor).toBe("#bfe3d2");
  // Preserve explicit color and edges through save -> browser hydration -> autosave.
  snapshot.nodes[0].style.background = "#e8f5ee";
  snapshot.edges = [
    {
      id: "e2e-edge",
      source: snapshot.nodes[0].id,
      target: snapshot.nodes[1].id,
      type: "default",
      label: "延伸",
      style: { stroke: "#d97887" },
    },
  ];
  const convergenceFirst = snapshot.convergenceNodes[0];
  const convergenceSecond = {
    ...convergenceFirst,
    id: "converge-e2e-second",
    position: {
      x: convergenceFirst.position.x + 340,
      y: convergenceFirst.position.y + 160,
    },
    data: { ...convergenceFirst.data, nodeTitle: "收斂第二節點" },
  };
  snapshot.convergenceNodes.push(convergenceSecond);
  snapshot.convergenceEdges = [
    {
      id: "e2e-manual-convergence-edge",
      source: convergenceFirst.id,
      target: convergenceSecond.id,
      type: "default",
      label: "收斂原始關係",
    },
  ];
  expect(
    (
      await request.put(`${apiURL}/projects/${projectId}/canvas`, {
        headers,
        data: { ...snapshot, baseUpdatedAt: snapshot.updatedAt },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  for (const area of ["zone", "diverge", "converge"])
    await expect(
      page
        .locator(`[data-canvas-area="${area}"]`)
        .getByText(`${area} 節點`, { exact: true }),
    ).toBeVisible();
  const zoneNodes = page.locator('[data-canvas-area="zone"] .react-flow__node');
  const first = await zoneNodes.nth(0).boundingBox();
  const second = await zoneNodes.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(
    first!.x + first!.width <= second!.x ||
      second!.x + second!.width <= first!.x ||
      first!.y + first!.height <= second!.y ||
      second!.y + second!.height <= first!.y,
  ).toBeTruthy();
  await expect(page.locator(".react-flow__edge-path")).toHaveCount(2);
  await expect(page.locator(`[data-id="${snapshot.nodes[0].id}"]`)).toHaveCSS(
    "background-color",
    "rgb(232, 245, 238)",
  );
  // Editing an actual edge must retain the label when reopened and after reload.
  await page
    .locator(
      '.react-flow__edge[data-id="e2e-edge"] .react-flow__edge-interaction',
    )
    .dblclick({ force: true });
  await expect(page.getByLabel("連線文字", { exact: true })).toHaveValue(
    "延伸",
  );
  await page.getByLabel("連線文字", { exact: true }).fill("驗證後的關係");
  const edgeSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/projects/${projectId}/canvas`) &&
      response.request().method() === "PUT" &&
      response
        .request()
        .postDataJSON()
        ?.edges?.some(
          (edge: { label?: string }) => edge.label === "驗證後的關係",
        ) &&
      response.ok(),
  );
  await page.getByRole("button", { name: "儲存變更", exact: true }).click();
  await edgeSaved;
  await expect(
    page.locator(
      '.react-flow__edge[data-id="e2e-edge"] .react-flow__edge-text',
    ),
  ).toHaveText("驗證後的關係");
  await page
    .locator(
      '.react-flow__edge[data-id="e2e-manual-convergence-edge"] .react-flow__edge-interaction',
    )
    .dblclick({ force: true });
  await expect(page.getByLabel("連線文字", { exact: true })).toHaveValue(
    "收斂原始關係",
  );
  await page.getByLabel("連線文字", { exact: true }).fill("收斂已修改關係");
  const convergenceEdgeSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/projects/${projectId}/canvas`) &&
      response.request().method() === "PUT" &&
      response
        .request()
        .postDataJSON()
        ?.convergenceEdges?.some(
          (edge: { label?: string }) => edge.label === "收斂已修改關係",
        ) &&
      response.ok(),
  );
  await page.getByRole("button", { name: "儲存變更", exact: true }).click();
  await convergenceEdgeSaved;
  await page.reload();
  await expect(
    page.locator(
      '.react-flow__edge[data-id="e2e-edge"] .react-flow__edge-text',
    ),
  ).toHaveText("驗證後的關係");
  await expect(
    page.locator(
      '.react-flow__edge[data-id="e2e-manual-convergence-edge"] .react-flow__edge-text',
    ),
  ).toHaveText("收斂已修改關係");
  await expect(
    page.getByRole("button", { name: "匯出 JSON", exact: true }),
  ).toHaveCount(0);
  for (const format of ["PDF", "PNG"])
    await expect(
      page.getByRole("button", { name: `匯出 ${format}`, exact: true }),
    ).toBeVisible();
  await expect(page.getByRole("button", { name: /匯出.*MD|ZIP/ })).toHaveCount(
    0,
  );
  const download = page.waitForEvent("download");
  const beforeExport = await page
    .locator(".react-flow__viewport")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("style")),
    );
  await page.getByRole("button", { name: "匯出 PNG", exact: true }).click();
  const pngDownload = await download;
  expect(pngDownload.suggestedFilename()).toMatch(/-PNG\.zip$/);
  const archive = await JSZip.loadAsync(
    await readFile((await pngDownload.path())!),
  );
  const images = Object.keys(archive.files).filter((name) =>
    name.endsWith(".png"),
  );
  expect(images).toHaveLength(4);
  for (const name of images) {
    const bytes = await archive.file(name)!.async("nodebuffer");
    expect(bytes.readUInt32BE(16)).toBe(1500);
    expect(bytes.readUInt32BE(20)).toBe(1041);
    expect(bytes.length).toBeGreaterThan(6000);
    // A successful download can still contain an all-white image. Inspect the
    // graph below the heading, including a real pastel node and its connection.
    if (name.includes("資料架構區") || name.includes("收斂總結區")) {
      const pixels = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(
          0,
          90,
          image.width,
          image.height - 90,
        ).data;
        let pastel = 0;
        let ink = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (
            data[i] < 250 &&
            data[i + 1] > data[i] + 3 &&
            data[i + 2] > data[i]
          )
            pastel++;
          if (data[i] < 150 && data[i + 1] < 150 && data[i + 2] < 150) ink++;
        }
        let solidDarkBlocks = 0;
        for (let y = 0; y < image.height - 100; y += 10) {
          for (let x = 0; x < image.width - 10; x += 10) {
            let black = 0;
            for (let dy = 0; dy < 10; dy++)
              for (let dx = 0; dx < 10; dx++) {
                const index = ((y + dy) * image.width + x + dx) * 4;
                if (
                  data[index] < 15 &&
                  data[index + 1] < 15 &&
                  data[index + 2] < 15
                )
                  black++;
              }
            if (black > 95) solidDarkBlocks++;
          }
        }
        return { pastel, ink, solidDarkBlocks };
      }, bytes.toString("base64"));
      expect(pixels.pastel).toBeGreaterThan(1000);
      expect(pixels.ink).toBeGreaterThan(100);
      expect(pixels.solidDarkBlocks).toBe(0);
    }
    if (name.includes("資料架構區"))
      await writeFile(".e2e/export-zone.png", bytes);
    if (name.includes("收斂總結區"))
      await writeFile(".e2e/export-convergence.png", bytes);
  }
  expect(
    await page
      .locator(".react-flow__viewport")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("style")),
      ),
  ).toEqual(beforeExport);
  await expect(page.locator("[data-export-stage]")).toHaveCount(0);
  // Exercise the actual PDF export pipeline. Suppress only the OS print dialog;
  // print the exported iframe's unchanged HTML through Chromium's PDF engine.
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = "true";
    };
  });
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.getByRole("button", { name: "匯出 PDF", exact: true }).click();
  const printFrame = page.frameLocator('iframe[title="PDF 列印預覽"]');
  await expect(printFrame.locator("html")).toHaveAttribute(
    "data-print-requested",
    "true",
  );
  await expect(printFrame.locator("section")).toHaveCount(4);
  const printHtml = await printFrame
    .locator("html")
    .evaluate((element) => element.outerHTML);
  const printPage = await page.context().newPage();
  await printPage.setContent(printHtml);
  await printPage
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
    );
  await mkdir("output/pdf", { recursive: true });
  await printPage.pdf({
    path: "output/pdf/canvas-acceptance.pdf",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await printPage.close();
  // Wide/negative graph coordinates must produce bounded image tiles, not an
  // enormous bitmap or a "canvas too large" error.
  const normal = await (
    await request.get(`${apiURL}/projects/${projectId}/canvas`, { headers })
  ).json();
  const wide = structuredClone(normal);
  wide.nodes[0].position.x = -1200;
  wide.nodes[1].position.x = 18000;
  expect(
    (
      await request.put(`${apiURL}/projects/${projectId}/canvas`, {
        headers,
        data: { ...wide, baseUpdatedAt: normal.updatedAt },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  const wideDownload = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: "匯出 PNG", exact: true }).click();
  const wideArchive = await JSZip.loadAsync(
    await readFile((await (await wideDownload).path())!),
  );
  const wideImages = Object.keys(wideArchive.files).filter((name) =>
    name.endsWith(".png"),
  );
  expect(wideImages.length).toBeGreaterThan(20);
  for (const name of wideImages) {
    const bytes = await wideArchive.file(name)!.async("nodebuffer");
    expect(bytes.readUInt32BE(16)).toBe(1500);
    expect(bytes.readUInt32BE(20)).toBe(1041);
  }
  const afterWide = await (
    await request.get(`${apiURL}/projects/${projectId}/canvas`, { headers })
  ).json();
  expect(
    (
      await request.put(`${apiURL}/projects/${projectId}/canvas`, {
        headers,
        data: { ...normal, baseUpdatedAt: afterWide.updatedAt },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  // Real browser offline -> failed autosave -> explicit retry -> reload.
  await page.context().setOffline(true);
  await page
    .locator('[data-canvas-area="zone"] .react-flow__node')
    .getByText("zone 節點", { exact: true })
    .dblclick();
  await page
    .getByLabel("內容", { exact: true })
    .fill("離線修改，恢復後重試保存");
  await page.getByRole("button", { name: "儲存變更", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "儲存失敗，點此重試", exact: true }),
  ).toBeVisible();
  await page.context().setOffline(false);
  const retried = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/projects/${projectId}/canvas`) &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await page
    .getByRole("button", { name: "儲存失敗，點此重試", exact: true })
    .click();
  await retried;
  await page.reload();
  await expect(
    page.getByText("離線修改，恢復後重試保存", { exact: true }),
  ).toBeVisible();
  // Two real tabs: the stale tab must report a conflict and not overwrite.
  const stalePage = await page.context().newPage();
  const staleInitialLoad = stalePage.waitForResponse(
    (response) =>
      response.url().endsWith(`/projects/${projectId}/canvas`) &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  await stalePage.goto(projectURL);
  await staleInitialLoad;
  await expect(stalePage.locator('.react-flow__node')).toHaveCount(5);
  await expect(stalePage.getByRole('status')).toHaveText('已儲存');
  const freshInitialLoad = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/projects/${projectId}/canvas`) &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  await page.reload();
  await freshInitialLoad;
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await expect(page.getByRole('status')).toHaveText('已儲存');
  await page
    .locator('[data-canvas-area="zone"] .react-flow__node')
    .getByText("zone 節點", { exact: true })
    .dblclick();
  await page.getByLabel("內容", { exact: true }).fill("第一分頁的新版本");
  const freshSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/projects/${projectId}/canvas`) &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "儲存變更", exact: true }).click();
  await freshSaved;
  await stalePage
    .locator('[data-canvas-area="zone"] .react-flow__node')
    .getByText("zone 節點", { exact: true })
    .dblclick();
  await stalePage
    .getByLabel("內容", { exact: true })
    .fill("第二分頁未儲存的內容");
  await stalePage
    .getByRole("button", { name: "儲存變更", exact: true })
    .click();
  await expect(
    stalePage.getByRole("button", { name: /更新衝突/ }),
  ).toBeVisible();
  const finalSnapshot = await (
    await request.get(`${apiURL}/projects/${projectId}/canvas`, { headers })
  ).json();
  expect(
    finalSnapshot.nodes.find(
      (node: { id: string }) => node.id === normal.nodes[0].id,
    ).data.nodeContent,
  ).toBe("第一分頁的新版本");
  await stalePage.close();
  await page.screenshot({ path: ".e2e/canvas.png", fullPage: true });
  await expect(page.locator('[data-conversation-header]')).toContainText("思考夥伴");
  await expect(page.getByText(/^(Data Pool|Data Zone|AI Partner|Divergence|Convergence)$/)).toHaveCount(0);
  await page.goto("/workspaces");
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(projectURL);
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test("純色票選取、儲存與重載", async ({ page, request }) => {
  const username = await registerAndVerify(page);
  await login(page, username);
  const headers = {
    Authorization: `Bearer ${await accessToken(request, username)}`,
  };
  const workspaces = await (
    await request.get(`${apiURL}/workspaces`, { headers })
  ).json();
  const created = await request.post(
    `${apiURL}/workspaces/${workspaces[0].id}/projects`,
    {
      headers,
      data: { name: "色票驗收", layoutDirection: "TB" },
    },
  );
  expect(created.ok()).toBeTruthy();
  const project = await created.json();
  await page.goto(`/workspaces/${workspaces[0].id}/projects/${project.id}`);
  const canvas = page.locator('[data-canvas-area="zone"]');
  await canvas.getByRole("button", { name: "文字節點", exact: true }).click();
  await page.getByLabel("標題", { exact: true }).fill("底色驗收節點");
  for (const [name, background] of [
    ["粉紅", "rgb(242, 198, 210)"],
    ["奶油", "rgb(244, 213, 141)"],
    ["薰衣草", "rgb(215, 200, 238)"],
    ["天藍", "rgb(191, 216, 243)"],
    ["白色", "rgb(255, 255, 255)"],
    ["薄荷", "rgb(191, 227, 210)"],
  ]) {
    const swatch = page.getByRole("button", { name, exact: true });
    await swatch.click();
    await expect(swatch).toHaveAttribute("aria-pressed", "true");
    await expect(swatch.locator("span").first()).toHaveCSS(
      "background-color",
      background,
    );
    await expect(swatch).toHaveText("");
    await expect(page.getByTestId("node-color-preview")).toHaveCount(0);
  }
  await mkdir("output/screenshots", { recursive: true });
  await page
    .getByRole("dialog", { name: "新增節點", exact: true })
    .screenshot({ path: "output/screenshots/node-color-picker.png" });
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/projects/${project.id}/canvas`) &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "新增節點", exact: true }).click();
  await saved;
  await page.reload();
  const node = canvas
    .locator(".react-flow__node")
    .filter({ hasText: "底色驗收節點" });
  await expect(node).toHaveCSS("background-color", "rgb(191, 227, 210)");
  await expect(node.getByRole("button", { name: /^編輯節點：/ })).toHaveCount(
    0,
  );
  await expect(
    node.getByRole("button", { name: "標記為重要", exact: true }),
  ).toBeVisible();
  await node.getByText("底色驗收節點", { exact: true }).dblclick();
  await expect(
    page.getByRole("button", { name: "薄荷", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("未登入保護與錯誤密碼可正常顯示錯誤", async ({ page, request }) => {
  expect((await request.get(`${apiURL}/workspaces`)).status()).toBe(401);
  await page.goto("/workspaces");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("帳號", { exact: true }).fill("nonexistent_e2e");
  await page.getByLabel("密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登入 ContextFlow" }).click();
  await expect(page.locator("#auth-error")).toHaveText("帳號或密碼錯誤");
  await expect(page).toHaveURL(/\/login$/);
});
