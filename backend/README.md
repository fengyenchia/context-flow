# Backend — Next.js API

ContextFlow 後端是獨立的 Next.js Route Handlers 專案，開發 port 為 `3001`。API 位於 `app/api`，server-only 邏輯位於 `server`，所有公開端點都以 `/api` 開頭，不使用版本前綴。

`src/` 保留先前的 NestJS 原型作為遷移參考，但已由 `tsconfig.json` 與 ESLint 排除，不會被目前 Next.js runtime 編譯或部署。

- `app/api/[...path]/route.ts`：JWT、帳號、Workspace、Project、AI 與管理員 API
- `app/api/inngest/route.ts`：Inngest serve endpoint
- `server/`：JWT、密碼雜湊與 data store
- `drizzle/0000_initial.sql`：Neon/PostgreSQL 初始 schema
- `src/`：舊 NestJS 原型，非目前 runtime

啟動：`pnpm --filter @context-flow/backend dev`，API base URL 為 `http://localhost:3001/api`。
