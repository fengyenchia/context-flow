# Neon PostgreSQL 設定

## 目前實作狀態

`backend/src/db/schema.ts` 與 `backend/drizzle/0000_initial.sql` 已定義帳號、refresh session、AI credential、workspace membership、project、document 與 canvas node。`backend/src/db/client.ts` 也可建立 Neon HTTP client。

> [!WARNING]
> 目前 service 還直接操作 `AppStore` 的 Map，尚未改成 Neon repository。即使設定 `DATABASE_URL`，業務資料也不會自動寫入 Neon。這是正式部署前的必要開發項目，不應只靠改 `DATA_MODE=neon` 當成已完成。

## 建立 Neon 專案

1. 登入 Neon Console，建立 PostgreSQL project。
2. 建立 production branch；需要預覽環境時再建立 preview branch。
3. 從 Connect 畫面複製 pooled connection string。
4. 放到 `backend/.env.local`：

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

不要把連線字串加到 frontend，也不要以 `NEXT_PUBLIC_` 命名。

## 執行 migration

PowerShell 臨時設定變數後執行：

```powershell
$env:DATABASE_URL = "你的 Neon pooled connection string"
pnpm --filter @context-flow/backend db:migrate
Remove-Item Env:DATABASE_URL
```

需要修改 schema 時：

```powershell
pnpm --filter @context-flow/backend db:generate
```

先檢查新產生的 SQL，再對資料庫執行 migration。

## Repository 接線驗收條件

正式切換 `DATA_MODE=neon` 前必須確認：

- 註冊使用 transaction 同時新增 user、personal workspace、owner membership。
- 登入與 refresh token 在不同 Vercel instance 仍可使用。
- 邀請、角色、專案與 API Key 在冷啟動後仍存在。
- 修改角色或密碼時 `token_version` 與 sessions 一起失效。
- 最後一位系統管理員、最後一位 workspace owner 的限制在 transaction 內成立。
- 測試涵蓋併發邀請、重複 username 與 refresh token rotation。
