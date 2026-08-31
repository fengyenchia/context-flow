# ContextFlow

ContextFlow 是一個以「專案脈絡」為中心的多人共編工作台。使用者可以管理多個個人或共享工作區，在視覺化畫布整理問題、參考資料與決策，並使用自己的 Gemini API Key 取得 AI 協助。

## 目前功能

- 帳號註冊、登入、Access/Refresh JWT 輪替與 HttpOnly Cookie
- 個人工作區與共享工作區、成員邀請及角色權限
- 多專案管理與 React Flow 思考畫布
- 使用者自行加密儲存 Gemini API Key
- 帳號資料、密碼變更與管理員帳號管理
- 管理員發行 30 分鐘一次性密碼重設碼
- Cloudflare R2 預簽上傳、Liveblocks 授權與 Inngest 函式骨架
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
> Drizzle schema 與 migration 已建立，但目前 Next.js API repository 仍使用記憶體 store。`DATA_MODE=neon` 尚未完成接線，因此現階段不要把它視為可保存正式資料的 production build。部署前必須先完成 Neon repository；詳見 [Neon 指南](docs/02-neon-database.md)。

## 文件索引

1. [本機安裝與專案開啟流程](docs/01-local-development.md)
2. [Neon PostgreSQL 與 migration](docs/02-neon-database.md)
3. [Cloudflare R2](docs/03-cloudflare-r2.md)
4. [Gemini BYOK](docs/04-gemini-api-key.md)
5. [Liveblocks 多人共編](docs/05-liveblocks.md)
6. [Inngest 背景工作](docs/06-inngest.md)
7. [JWT、管理員與密碼重設](docs/07-jwt-and-admin.md)
8. [Vercel 部署](docs/08-vercel-deployment.md)

## 常用指令

```bash
pnpm dev          # 同時啟動 frontend 與 backend
pnpm dev:inngest  # 啟動 Inngest 本機開發介面
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check        # 依序執行全部檢查
```

所有雲端密鑰只放在 `.env` 或 Vercel Environment Variables；不要提交到 Git。`NEXT_PUBLIC_` 變數會進入瀏覽器 bundle，只能放可公開的值。
