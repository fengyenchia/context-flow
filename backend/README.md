# Backend — Next.js API

ContextFlow 後端是獨立的 Next.js Route Handlers 專案，開發 port 為 `3001`。API 位於 `app/api`，server-only 邏輯位於 `server`，所有公開端點都以 `/api` 開頭，不使用版本前綴。

目前 backend 是單一 Next.js API；Drizzle schema 與 client 放在 `src/db/`，供 API 的 Neon 持久化層使用。

- `app/api/[...path]/route.ts`：JWT、帳號、Workspace、Project、AI 與管理員 API
- `app/api/inngest/route.ts`：Inngest serve endpoint
- `server/`：JWT、密碼雜湊與 data store
- `drizzle/0000_initial.sql`：Neon/PostgreSQL 初始 schema
- `src/db/`：Drizzle schema 與 Neon client

啟動：`pnpm --filter @context-flow/backend dev`，API base URL 為 `http://localhost:3001/api`。
