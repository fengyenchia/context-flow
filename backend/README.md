# ContextFlow Backend

Next.js 16 Route Handlers API，開發埠 3001，base URL 為 `http://localhost:3001/api`；不使用 `/api/v1`。

| 位置 | 用途 |
| --- | --- |
| `app/api/[...path]/route.ts` | 帳號、工作區、專案、畫布、Gemini 與檔案 API |
| `server/auth.ts`、`password.ts`、`rate-limit.ts` | JWT、session、scrypt 與每程序登入操作限流 |
| `server/state.ts`、`persistence.ts` | 狀態、授權與 Neon 差異交易保存 |
| `server/files.ts` | 私人 R2 預簽上傳、大小確認與授權下載 |
| `src/db/`、`drizzle/` | schema、Neon client、migration 與 snapshots |

`app/api/inngest` 只保留未接入索引的 placeholder，不代表已提供文件解析／RAG。啟動與相依安裝從 repository 根目錄操作：

```sh
pnpm install --frozen-lockfile
pnpm --filter @context-flow/backend dev
```

未設定 DATABASE_URL 才使用記憶體；單改 DATA_MODE 不隔離既有連線。密鑰只放 backend，已有正式連線與加密 key 不更換。Production migration 已到 0004，不為部署重跑。

管理員角色由資料庫保存。完成初始化後移除 `INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD_HASH`，不要替換成現有管理員的帳號；本機需重啟 Backend，Vercel 需重新部署才套用移除結果。

詳細設定見 [專案 README](../README.md)、[帳號安全](../docs/07-jwt-and-admin.md)、[測試](../docs/10-e2e-testing.md)、[部署](../docs/08-vercel-deployment.md)、[平台防護](../docs/15-backend-security.md)。health 只表示設定存在，不代表外部服務已逐一驗證。
