import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const logo = await readFile(new URL('../frontend/public/brand/context-flow-logo.png', import.meta.url));
const output = new URL('../frontend/public/brand/og-image.png', import.meta.url);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route('**/*', route => route.abort());
  await page.setContent(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f7f7f5; color: #20201e; font-family: "Microsoft JhengHei", "Noto Sans CJK TC", "PingFang TC", sans-serif; }
    header { position: absolute; top: 64px; left: 64px; display: flex; align-items: center; gap: 22px; font-size: 32px; font-weight: 700; letter-spacing: -1px; }
    header img { width: 64px; height: 64px; }
    h1 { position: absolute; top: 207px; left: 64px; margin: 0; font-size: 50px; font-weight: 700; line-height: 1.4; letter-spacing: -1.5px; }
    p { position: absolute; top: 385px; left: 64px; margin: 0; font-size: 23px; color: #6f706b; }
    .canvas { position: absolute; top: 150px; right: 48px; width: 514px; height: 370px; border-radius: 20px; background-image: radial-gradient(#deded8 1px, transparent 1px); background-size: 18px 18px; }
    svg { width: 100%; height: 100%; overflow: visible; }
    svg text { fill: #20201e; font-size: 24px; font-weight: 700; text-anchor: middle; }
    .edge { fill: none; stroke: #d87a86; stroke-width: 2.5; }
    .bar { fill: #deded8; }
  </style><body>
    <header><img src="data:image/png;base64,${logo.toString('base64')}" alt=""><span>ContextFlow</span></header>
    <h1>整理資料，<br>串起想法與決策。</h1>
    <p>個人與團隊的專案畫布</p>
    <div class="canvas"><svg viewBox="0 0 514 370" xmlns="http://www.w3.org/2000/svg">
      <path class="edge" d="M186 68 C238 68 230 185 292 185"/>
      <path class="edge" d="M186 185 H292"/>
      <path class="edge" d="M186 302 C238 302 230 185 292 185"/>
      <g stroke="#e5e5df" stroke-width="1.5">
        <rect x="26" y="27" width="160" height="82" rx="12" fill="#fdf9ec"/>
        <rect x="26" y="144" width="160" height="82" rx="12" fill="#f1f9f6"/>
        <rect x="26" y="261" width="160" height="82" rx="12" fill="#f6f4fc"/>
        <rect x="292" y="130" width="196" height="110" rx="12" fill="#faf1f2"/>
      </g>
      <text x="106" y="78">資料</text><text x="106" y="195">想法</text><text x="106" y="312">討論</text>
      <text x="390" y="180">專案決策</text>
      <rect class="bar" x="338" y="199" width="104" height="5" rx="2.5"/>
      <rect class="bar" x="352" y="213" width="76" height="5" rx="2.5"/>
      <g fill="#d87a86"><circle cx="186" cy="68" r="4"/><circle cx="186" cy="185" r="4"/><circle cx="186" cy="302" r="4"/><circle cx="292" cy="185" r="4"/></g>
    </svg></div>
  </body></html>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, image => image.decode()));
  });
  await mkdir(new URL('.', output), { recursive: true });
  await page.screenshot({ path: fileURLToPath(output), type: 'png' });
  console.log('Generated frontend/public/brand/og-image.png (1200 × 630)');
} finally {
  await browser.close();
}
