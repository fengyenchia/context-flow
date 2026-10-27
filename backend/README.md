# ContextFlow Backend

Next.js 16 Route Handlers API，開發埠 3001，base URL 為 `http://localhost:3001/api`。

| 位置 | 用途 |
| --- | --- |
| `app/api/[...path]/route.ts` | 帳號、工作區、專案、畫布、Gemini 與檔案 API |
| `server/auth.ts`、`password.ts`、`rate-limit.ts` | JWT、session、scrypt 與每程序登入操作限流 |
| `server/state.ts`、`persistence.ts` | 狀態、授權與 Neon 差異交易保存 |
| `server/files.ts` | 私人 R2 預簽上傳、大小確認與授權下載 |
| `server/collaboration.ts` | Liveblocks 私人房間、ID token、角色同步及舊畫布匯入 |
| `src/db/`、`drizzle/` | schema、Neon client、migration 與 snapshots |

啟動與相依安裝從 repository 根目錄操作：

```sh
pnpm install --frozen-lockfile
pnpm --filter @context-flow/backend dev
```

未設定 `DATABASE_URL` 時使用記憶體模式；設定後使用 Neon。密鑰只放 Backend。重新部署不需重跑已套用的 migration。

管理員設定見 [帳號安全](../docs/07-jwt-and-admin.md)。

詳細設定見 [專案 README](../README.md)、[帳號安全](../docs/07-jwt-and-admin.md)、[測試](../docs/10-e2e-testing.md)、[部署](../docs/08-vercel-deployment.md)、[平台防護](../docs/15-backend-security.md)。health 只表示設定存在，不代表外部服務已逐一驗證。
