# ContextFlow

ContextFlow 是一個以「專案脈絡」為中心的團隊共享工作台。使用者可以管理多個個人或共享工作區，在視覺化畫布整理問題、參考資料與決策，並使用自己的 Gemini API Key 取得 AI 協助。

## 目前功能

- 帳號註冊、登入、Access/Refresh JWT 輪替與 HttpOnly Cookie
- 個人工作區與共享工作區、成員邀請及角色權限
- 多專案管理與 React Flow 思考畫布
- 使用者自行加密儲存 Gemini API Key
- 帳號資料、密碼變更與管理員帳號管理
- 管理員發行 30 分鐘一次性密碼重設碼
- Cloudflare R2 預簽上傳、檔案確認與授權下載；Liveblocks 即時同步尚未接入
- Neon/Drizzle schema 與初始 migration

## 技術架構

```text
context-flow/
├─ frontend/   Next.js 16 UI（port 3000）、Tailwind CSS、React Flow
├─ backend/    Next.js 16 Route Handlers API（port 3001）、JWT、Drizzle、R2、Inngest
├─ docs/       本機設定與各雲端服務操作指南
└─ IDEA.md     產品與技術規格
```

## 快速啟動

需求：Node.js 24+、pnpm 11+。

```bash
pnpm install
Copy-Item backend\.env.example backend\.env.local
Copy-Item frontend\.env.example frontend\.env.local
pnpm dev
```

開啟：

- 前端：<http://localhost:3000>
- API：<http://localhost:3001/api>
- Health check：<http://localhost:3001/api/health>

開發環境預設使用 `DATA_MODE=memory`，註冊後即可測試完整帳號與工作區流程；重新啟動後資料會清空。完整環境變數與密鑰產生方式請依照 [本機開發指南](docs/01-local-development.md) 操作。

> [!IMPORTANT]
> Next.js API 透過 Drizzle 將帳號、工作區、專案與畫布持久化到 Neon 正規化資料表，不再讀寫 `app_state`；請在部署環境設定 `DATABASE_URL` 與 `DATA_MODE=neon`。目前 production migration 已到 0004，不為部署重跑舊 migration。完整環境變數請依照 [Neon 指南](docs/02-neon-database.md) 操作。

## 文件索引

0. [功能盤點與開發狀態](docs/09-product-status.md)
1. [本機安裝與專案開啟流程](docs/01-local-development.md)
2. [Neon PostgreSQL 與 migration](docs/02-neon-database.md)
3. [Cloudflare R2](docs/03-cloudflare-r2.md)
4. [Gemini BYOK](docs/04-gemini-api-key.md)
5. [Liveblocks 多人共編](docs/05-liveblocks.md)
6. [Inngest 背景工作](docs/06-inngest.md)
7. [JWT、管理員與密碼重設](docs/07-jwt-and-admin.md)
8. [Vercel 部署](docs/08-vercel-deployment.md)
9. [E2E 自動化驗證](docs/10-e2e-testing.md)
10. [上線前操作與瀏覽器驗收](docs/11-release-checklist.md)

## 常用指令

```bash
pnpm dev          # 同時啟動 frontend 與 backend
pnpm dev:inngest  # 啟動 Inngest 本機開發介面
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e:api # API 整合流程（隔離記憶體資料）
pnpm test:e2e     # Chromium 登入、工作區、專案、畫布流程
pnpm test:db      # 只使用 TEST_DATABASE_URL 的專用測試分支
pnpm check:env    # 檢查本機環境變數完整性，不印出密鑰
pnpm check:secrets -- --staged --history # 檢查暫存區與本機可見 Git 歷史，不印出密鑰
pnpm test:secrets # 密鑰掃描工具的隔離測試
pnpm build
pnpm check        # 依序執行全部檢查
```

所有雲端密鑰只放在 `.env` 或 Vercel Environment Variables；不要提交到 Git。`NEXT_PUBLIC_` 變數會進入瀏覽器 bundle，只能放可公開的值。
