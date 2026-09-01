# Neon PostgreSQL 設定

## 目前實作狀態

`backend/src/db/schema.ts` 與 `backend/drizzle/0000_initial.sql` 已定義帳號、refresh session、AI credential、workspace membership、project、document 與 canvas node。`backend/src/db/client.ts` 也可建立 Neon HTTP client。

> [!WARNING]
> 目前 service 還直接操作 `AppStore` 的 Map，尚未改成 Neon repository。即使設定 `DATABASE_URL`，業務資料也不會自動寫入 Neon。這是正式部署前的必要開發項目，不應只靠改 `DATA_MODE=neon` 當成已完成。

## 建立 Neon 專案

1. 登入 Neon Console，建立 PostgreSQL project。
2. 建立 production branch；需要預覽環境時再建立 preview branch。
3. 從 Connect 畫面複製兩組 connection string：
   - Pooled：給 Vercel/serverless 執行時使用。
   - Direct：給 Drizzle migration 使用（Neon 官方建議 migration 使用 direct connection）。
4. 本機先放到 `backend/.env.local`：

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

本機執行 migration 時，`DATABASE_URL` 暫時改成 Direct connection；正式 Vercel Backend 則使用 Pooled connection。兩者都必須是同一個 Neon branch/database。

不要把連線字串加到 frontend，也不要以 `NEXT_PUBLIC_` 命名。

## 執行 migration

PowerShell 臨時設定變數後執行：

```powershell
$env:DATABASE_URL = "你的 Neon direct connection string"
pnpm --filter @context-flow/backend db:migrate
Remove-Item Env:DATABASE_URL
```

需要修改 schema 時：

```powershell
pnpm --filter @context-flow/backend db:generate
```

先檢查新產生的 SQL，再對資料庫執行 migration。

## Vercel 正式環境

在 Vercel Backend Project 的 **Settings → Environment Variables** 新增：

```dotenv
DATA_MODE=neon
DATABASE_URL=你的 Neon pooled connection string
```

同時保留 JWT secrets、`USER_API_KEY_ENCRYPTION_KEY`、`FRONTEND_URL`、`PUBLIC_APP_URL`、Resend 與其他服務設定。儲存後重新部署 backend。

## 驗證資料庫連線

1. 在 Neon SQL Editor 執行：

```sql
select now();
```

2. 執行 migration 後確認 `drizzle.__drizzle_migrations` 與應用程式需要的資料表已建立。
3. 開啟 `https://api.context-flow.fengyenchia.com/api/health`。
4. 註冊一個測試帳號，重新啟動 backend 後再登入，確認資料不是只存在記憶體。

> 目前 ContextFlow 的業務 service 仍使用 `AppStore` memory adapter，尚未把註冊、登入、workspace、project 等操作接到 Neon repository。完成 repository 接線前，即使 `DATA_MODE=neon`，正式資料仍不會完整保存；這是程式碼工作，不是單純環境變數設定。

## Repository 接線驗收條件

正式切換 `DATA_MODE=neon` 前必須確認：

- 註冊使用 transaction 同時新增 user、personal workspace、owner membership。
- 登入與 refresh token 在不同 Vercel instance 仍可使用。
- 邀請、角色、專案與 API Key 在冷啟動後仍存在。
- 修改角色或密碼時 `token_version` 與 sessions 一起失效。
- 最後一位系統管理員、最後一位 workspace owner 的限制在 transaction 內成立。
- 測試涵蓋併發邀請、重複 username 與 refresh token rotation。
