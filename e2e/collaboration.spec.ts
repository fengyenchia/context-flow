import { expect, test, type Browser, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test';
import { Y, seedDocument, readSnapshot } from '../packages/collaboration/src/index';

const url = '/workspaces/shared/projects/shared-project';
const initial = {
  nodes: [
    { id: 'zone-a', position: { x: 80, y: 80 }, data: { nodeKind: 'text', nodeTitle: '共同節點', nodeContent: '原文', nodeColor: '#f2c6d2' }, style: { width: 220, background: '#f2c6d2' } },
    { id: 'zone-b', position: { x: 80, y: 300 }, data: { nodeKind: 'text', nodeTitle: '第二節點', nodeContent: '第二內容' }, style: { width: 220 } },
    { id: 'diverge-d', position: { x: 80, y: 80 }, data: { nodeKind: 'text', nodeTitle: '發散節點', nodeContent: '發散內容' }, style: { width: 220 } },
  ],
  edges: [{ id: 'edge-ab', source: 'zone-a', target: 'zone-b', label: '原關係' }],
  convergenceNodes: [{ id: 'converge-c', position: { x: 80, y: 80 }, data: { nodeKind: 'text', nodeTitle: '收斂節點', nodeContent: '收斂內容' }, style: { width: 220 } }],
  convergenceEdges: [], resources: [], conversations: {}, summary: '',
};

async function fixture(browser: Browser, text = '原文') {
  const snapshot = structuredClone(initial);
  snapshot.nodes[0].data.nodeContent = text;
  const server = seedDocument(snapshot);
  const sockets = new Map<WebSocketRoute, string>();
  const presence = new Map<WebSocketRoute, unknown>();
  const broadcastPresence = () => { for (const peer of sockets.keys()) peer.send(JSON.stringify({ participants: [...presence].filter(([source]) => source !== peer).map(([, person]) => person) })); };
  const blocked = new Set<string>();
  const contexts: BrowserContext[] = [];
  let writes = 0;
  async function client(name: string, role = 'editor') {
    const context = await browser.newContext(); contexts.push(context);
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const headers = { 'access-control-allow-origin': 'http://127.0.0.1:3100', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS' };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const project = { id: 'shared-project', workspaceId: 'shared', name: '共編測試', description: '', layoutDirection: 'LR', role, collaborationEnabled: true };
      if (path === '/api/auth/refresh') return route.fulfill({ headers, json: { user: { id: name, username: name, displayName: name, role: 'user', status: 'active' }, accessToken: `fixture-${name}` } });
      if (path === '/api/projects/shared-project') return route.fulfill({ headers, json: project });
      if (path.endsWith('/collaboration/auth')) return route.fulfill({ headers, json: { token: `fixture-${name}` } });
      if (path.endsWith('/canvas') && method === 'GET') return route.fulfill({ headers, json: { ...readSnapshot(server), updatedAt: null } });
      if (path.endsWith('/canvas') && method === 'PUT') { writes++; throw new Error('Realtime mode must never PUT a whole snapshot'); }
      throw new Error(`Unexpected request ${method} ${path}`);
    });
    await context.routeWebSocket('**/__test-collaboration/**', socket => {
      if (blocked.has(name)) { socket.close(); return; }
      sockets.set(socket, name);
      socket.send(JSON.stringify({ hello: true, update: [...Y.encodeStateAsUpdate(server)] }));
      socket.onMessage(data => {
        const payload = JSON.parse(String(data));
        if (payload.presence) { presence.set(socket, payload.presence); broadcastPresence(); return; }
        if (!Array.isArray(payload.update)) return;
        if (role === 'viewer') return;
        const update = new Uint8Array(payload.update);
        Y.applyUpdate(server, update);
        for (const peer of sockets.keys()) peer.send(JSON.stringify({ update: [...update] }));
      });
      socket.onClose(() => { sockets.delete(socket); presence.delete(socket); broadcastPresence(); });
    });
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.locator('[data-collaboration-status]')).toHaveAttribute('data-collaboration-status', 'synced', { timeout: 120_000 });
    return page;
  }
  return {
    server, client,
    offline: (name: string) => { blocked.add(name); for (const [socket, user] of sockets) if (name === user) { sockets.delete(socket); presence.delete(socket); socket.close(); } broadcastPresence(); },
    online: (name: string) => blocked.delete(name),
    close: async () => { expect(writes).toBe(0); for (const context of contexts) await context.close(); server.destroy(); },
  };
}
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
async function edit(page: Page, id: string, title: string) {
  await node(page, id).getByText(title, { exact: true }).dblclick();
  await expect(page.getByRole('dialog', { name: '編輯節點', exact: true })).toBeVisible();
}
const save = (page: Page) => page.getByRole('button', { name: '儲存變更', exact: true }).click();

test('two users merge concurrent node dialogs, fields, text and all canvas areas, and reload the saved result', async ({ browser }, testInfo) => {
  test.setTimeout(360_000);
  const f = await fixture(browser);
  try {
    const a = await f.client('alice'); const b = await f.client('bob');
    await edit(a, 'zone-a', '共同節點'); await edit(b, 'zone-a', '共同節點');
    await a.getByLabel('內容', { exact: true }).fill('甲原文');
    await a.getByRole('button', { name: '天藍', exact: true }).click();
    await save(a);
    // Bob's still-open dialog intentionally contains the old text/color.
    await expect(node(b, 'zone-a')).toContainText('甲原文');
    await b.getByLabel('內容', { exact: true }).fill('原文乙'); await save(b);
    for (const page of [a, b]) {
      await expect(node(page, 'zone-a')).toContainText('甲原文乙');
      await expect(node(page, 'zone-a')).toHaveCSS('background-color', 'rgb(191, 216, 243)');
    }
    await edit(a, 'diverge-d', '發散節點'); await edit(b, 'converge-c', '收斂節點');
    await a.getByLabel('內容', { exact: true }).fill('甲的發散'); await b.getByLabel('內容', { exact: true }).fill('乙的收斂');
    await Promise.all([save(a), save(b)]);
    await expect(node(b, 'diverge-d')).toContainText('甲的發散');
    await expect(node(a, 'converge-c')).toContainText('乙的收斂');
    const edge = a.locator('.react-flow__edge[data-id="edge-ab"] .react-flow__edge-interaction');
    // A perfectly vertical SVG path has a zero-width box; use its real midpoint.
    const point = await edge.evaluate(element => {
      const path = element as SVGGeometryElement;
      const middle = path.getPointAtLength(path.getTotalLength() / 2);
      const screen = new DOMPoint(middle.x, middle.y).matrixTransform(path.getScreenCTM()!);
      return { x: screen.x, y: screen.y };
    });
    await a.mouse.dblclick(point.x, point.y);
    await a.getByLabel('連線文字', { exact: true }).fill('共編關係'); await save(a);
    await expect(b.getByText('共編關係', { exact: true })).toBeVisible();
    await a.getByPlaceholder('資料標題', { exact: true }).fill('共享來源');
    await a.getByPlaceholder('貼上筆記或文字…').fill('兩人共用的資料池');
    await a.getByRole('button', { name: '加入資料池' }).click();
    await expect(b.getByText('共享來源', { exact: true })).toBeVisible();
    for (const page of [a, b]) await expect(page.locator('[data-collaboration-status]')).toHaveAttribute('data-collaboration-status', 'synced');
    await a.reload(); await b.reload();
    for (const page of [a, b]) {
      await expect(page.locator('[data-collaboration-status]')).toHaveAttribute('data-collaboration-status', 'synced');
      await expect(node(page, 'zone-a')).toContainText('甲原文乙');
      await expect(node(page, 'diverge-d')).toContainText('甲的發散');
      await expect(node(page, 'converge-c')).toContainText('乙的收斂');
      await expect(page.getByText('共編關係', { exact: true })).toBeVisible();
      await expect(page.getByText('共享來源', { exact: true })).toBeVisible();
    }
    await a.screenshot({ path: testInfo.outputPath('collaboration-synced.png') });
  } finally { await f.close(); }
});

test('offline changes merge on reconnect and viewers receive updates without edit controls', async ({ browser }) => {
  const f = await fixture(browser);
  try {
    const a = await f.client('alice'); const b = await f.client('bob'); const viewer = await f.client('viewer', 'viewer');
    f.offline('bob');
    await expect(b.locator('[data-collaboration-status]')).toHaveAttribute('data-collaboration-status', 'offline');
    await edit(b, 'zone-a', '共同節點'); await b.getByLabel('內容', { exact: true }).fill('原文離線'); await save(b);
    await edit(a, 'zone-a', '共同節點'); await a.getByLabel('內容', { exact: true }).fill('線上原文'); await save(a);
    f.online('bob');
    for (const page of [a, b, viewer]) await expect(node(page, 'zone-a')).toContainText('線上原文離線');
    await expect(viewer.locator('[data-tour="node-toolbar-zone"]')).toHaveCount(0);
    await node(viewer, 'zone-a').getByText('共同節點', { exact: true }).dblclick();
    await expect(viewer.getByRole('dialog')).toHaveCount(0);
  } finally { await f.close(); }
});

test('simultaneous multi-position text changes preserve untouched text without duplication', async ({ browser }) => {
  const f = await fixture(browser, 'abcdef');
  try {
    const a = await f.client('alice'); const b = await f.client('bob');
    await edit(a, 'zone-a', '共同節點'); await edit(b, 'zone-a', '共同節點');
    await a.getByLabel('內容', { exact: true }).fill('AbcdeF');
    await b.getByLabel('內容', { exact: true }).fill('abCDef');
    await Promise.all([save(a), save(b)]);
    for (const page of [a, b]) await expect(node(page, 'zone-a')).toContainText('AbCDeF');
  } finally { await f.close(); }
});

test('cursor presence follows the correct area and viewport, supports viewers, and disappears on leave', async ({ browser }, testInfo) => {
  const f = await fixture(browser);
  try {
    const a = await f.client('alice'), b = await f.client('bob'), viewer = await f.client('viewer', 'viewer');
    await expect(b.locator('[aria-label="其他在線協作者"]')).toContainText('alice');
    await expect(b.locator('[aria-label="其他在線協作者"]')).toContainText('viewer');
    await expect(node(a, 'zone-a')).toBeVisible();
    const pane = (page: Page, area = 'zone') => page.locator(`[data-canvas-area="${area}"] .react-flow`);
    await pane(b).getByRole('button', { name: 'Zoom In', exact: true }).click();
    await a.bringToFront();
    const box = (await pane(a).boundingBox())!;
    const point = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.45 };
    const baseline = readSnapshot(f.server);
    await a.mouse.move(point.x, point.y);
    const cursor = b.locator('[data-remote-cursor][data-cursor-user="alice"][data-cursor-area="zone"]');
    await expect(cursor).toBeVisible();
    const sourceTransform = await pane(a).locator('.react-flow__viewport').evaluate(el => { const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform); return { x: matrix.e, y: matrix.f, zoom: matrix.a }; });
    const flow = { x: (point.x - box.x - sourceTransform.x) / sourceTransform.zoom, y: (point.y - box.y - sourceTransform.y) / sourceTransform.zoom };
    const actual = await cursor.evaluate(el => ({ x: parseFloat((el as HTMLElement).style.left), y: parseFloat((el as HTMLElement).style.top) }));
    expect(actual.x).toBeCloseTo(flow.x, 0); expect(actual.y).toBeCloseTo(flow.y, 0);
    await b.screenshot({ path: testInfo.outputPath('collaboration-presence.png') });
    await a.mouse.move(5, 5); await expect(cursor).toHaveCount(0);
    await viewer.bringToFront(); const viewerBox = (await pane(viewer, 'diverge').boundingBox())!;
    await viewer.mouse.move(viewerBox.x + viewerBox.width * 0.6, viewerBox.y + 100);
    await expect(a.locator('[data-remote-cursor][data-cursor-user="viewer"][data-cursor-area="diverge"]')).toBeVisible();
    expect(readSnapshot(f.server)).toEqual(baseline);
    f.offline('viewer');
    await expect(a.locator('[data-remote-cursor][data-cursor-user="viewer"]')).toHaveCount(0);
    await expect(a.locator('[aria-label="其他在線協作者"]')).not.toContainText('viewer');
  } finally { await f.close(); }
});
