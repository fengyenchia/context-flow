# Vercel 部署

前後端分別部署為兩個 Vercel Project，共用同一個 repository。

## 先準備 Git（本機）

```sh
pnpm check:secrets -- --staged --history
git status --short
git log -1 --oneline
```

安全檢查只列出位置，不印出密鑰。它會比對本機環境檔的敏感值並檢查常見 token 格式，不保證識別所有格式。`backend/.env.local`、`.env.test.local`、`frontend/.env.local`、日誌、套件、測試輸出與私鑰檔均不可加入 Git；只有空白範本 `.env.example` 可以追蹤。

提交並執行 `git push origin main`。若 GitHub 已連到 Vercel，push 會依整合設定觸發部署。遠端有新提交時，先整合差異，不使用 force push 覆寫。

## 建立 Project

1. 登入 Vercel，選 **Add New → Project**，匯入 `fengyenchia/context-flow`。若沒有權限，先授權 Vercel GitHub App 讀取該 repository。
2. 同一個 repository 匯入兩次：先 `context-flow-backend`，再 `context-flow-frontend`；不要把兩者都設成 repository 根目錄。
3. 兩個 Project 的共同設定如下。先填環境變數再部署；安裝命令不手動 override 成裸的 `pnpm install`，避免平台選到不同 pnpm 版本。

| 設定 | Backend | Frontend |
| --- | --- | --- |
| Framework Preset | Next.js | Next.js |
| Root Directory | `backend` | `frontend` |
| Node.js | `24.x` | `24.x` |
| Build Command | `pnpm build` | `pnpm build` |
| Install Command | 保留自動偵測 | 保留自動偵測 |
| Output Directory | 保留 Next.js 預設 | 保留 Next.js 預設 |
| Include source files outside Root Directory | 開啟，保留根目錄 workspace/lockfile | 開啟，保留根目錄 workspace/lockfile |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | `1` |

程式已釘選 Node 24、pnpm 11.19.0，正式 build 使用已驗證的 Webpack 路徑。Vercel 建置日誌應顯示相符的 Node/pnpm；不要為了部署重新產生 lockfile。

4. Environment Variables 選擇 **Production**，敏感值設為 Sensitive（若介面提供）。Preview 另設隔離的 Neon、寄信與 R2 資源。
5. 建立／部署 backend，再建立／部署 frontend；未綁正式網域前，不用兩個不同 `vercel.app` 網址驗收登入重整。
6. 兩個 Project 各進 **Settings → Domains** 加入下方網域，在 DNS 平台依 Vercel 當下顯示的記錄填寫；不要照抄舊 IP。等待 DNS 與 HTTPS 正常。
7. 將 R2 bucket CORS 的 AllowedOrigins 加上正式前端網址（保留你仍需要的 localhost 開發來源）。核對 backend 的前端網址變數，變更變數後重新部署；前端 `NEXT_PUBLIC_` 變數需重新 build 才生效。
8. 如果 API 請求遇到 Vercel 平台登入頁／401，確認 backend 的 Production Deployment Protection 沒有攔截一般使用者的 API；不要把 protection bypass secret 填到前端。
9. 完成「部署後檢查」，再依 [Backend 防護](15-backend-security.md) 設定平台限流。截圖與日誌須遮蔽個資及憑證。

重新部署不需重跑已套用的 migration。`TEST_DATABASE_URL` 僅供本機隔離測試，不填入 Vercel。

建議同一 Git repository 建立兩個 Vercel Project，分別指定 Root Directory。正式網域為：

- Frontend：`https://context-flow.fengyenchia.com`
- Backend API：`https://api.context-flow.fengyenchia.com`

## Frontend Project

- Root Directory：`frontend`
- Framework：Next.js
- Build Command：`pnpm build`
- Environment Variable：

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://api.context-flow.fengyenchia.com/api
```

本機 `frontend/.env.local` 請維持 `http://localhost:3001/api`；上面的正式值只填在 Vercel Frontend Project，避免本機開發時誤連正式 API。

## Backend Project

- Root Directory：`backend`
- Framework：Next.js
- Build Command：`pnpm build`
- Environment Variables：複製 `backend/.env.example` 中的正式值
- `NODE_ENV` 使用平台預設 production，不手動覆寫
- `DATA_MODE=neon`
- `ENABLE_EXPERIMENTAL_COREPACK=1`
- `FRONTEND_URL=https://context-flow.fengyenchia.com`
- `PUBLIC_APP_URL=https://context-flow.fengyenchia.com`
- `RESEND_API_KEY=re_...`（只放 backend，不要加 `NEXT_PUBLIC_`）
- `EMAIL_FROM=ContextFlow <noreply@fengyenchia.com>`（寄件網域必須先在 Resend 驗證）

Backend production 至少需要 JWT secrets、`DATABASE_URL`、API Key encryption key 與寄信設定；檔案功能另需 R2。即時共編另需 Backend 的 `LIVEBLOCKS_SECRET_KEY` 及 `COLLABORATION_ENABLED=true`，切換與驗收見 [即時共編](16-realtime-collaboration.md)。備份限制或原檔清理啟用時需要 Inngest，其他功能不需設定。

畫布自動備份另需 `CANVAS_BACKUP_ENABLED=true`、`CANVAS_BACKUP_BUCKET_NAME` 與 `LIVEBLOCKS_WEBHOOK_SECRET`，並在 Liveblocks 訂閱 `ydocUpdated`；私人 bucket、權限與驗收見 [畫布備份](17-canvas-backups.md)。不需要 migration，Frontend 無需新增變數。

單一專案邀請另需先套用 migration 0005，再設定 Backend `PROJECT_INVITES_ENABLED=true`；不需新服務或 Frontend 變數。請依 [邀請部署順序](18-project-invitations.md) 操作，避免先啟用旗標卻尚未建立資料表。

刪除專案後清理原檔另設 `R2_PROJECT_CLEANUP_ENABLED=true`，沿用 Inngest 的兩個 key，不需 migration。先部署關閉旗標的新版、Resync 確認 `daily-original-file-cleanup`／`original-project-file-cleanup`，再啟用及重新部署、Resync。每日台灣時間 11:47 掃描，至少 24 小時寬限後清理，規則與正式驗收見 [R2](03-cloudflare-r2.md#刪除專案後清理原始檔)。

Backend 需填的變數名稱（值從本機安全複製，沿用已有加密 key 才能解密既有 Gemini Key）：`DATABASE_URL`、`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`USER_API_KEY_ENCRYPTION_KEY`、`RESEND_API_KEY`、`EMAIL_FROM`、`R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`FRONTEND_URL`、`PUBLIC_APP_URL`、`GEMINI_MODEL`（沿用目前值）、`DATA_MODE=neon`、`ENABLE_EXPERIMENTAL_COREPACK=1`。`NODE_ENV` 由 Vercel 正式 build/runtime 提供即可，不必手動覆寫。

完成管理員初始化後，移除 `INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD_HASH`，再重新部署 Backend。

Frontend 只填 `NEXT_PUBLIC_API_BASE_URL` 和 `ENABLE_EXPERIMENTAL_COREPACK=1`；不要填資料庫、JWT、R2、Resend 或使用者 Gemini secrets。

> [!CAUTION]
> 新環境需先完成資料庫 migration；既有環境不得重跑已套用版本。建置成功後仍需依 [上線檢查清單](11-release-checklist.md) 驗證實際流程。

## 部署後檢查

1. 打開 `https://api.context-flow.fengyenchia.com/api/health`，確認 integration 狀態。
2. 從 frontend 註冊、登入並 refresh 頁面。
3. 建立兩個使用者，測試邀請與 viewer 權限。
4. 測試 Gemini Key 儲存與 AI request。
5. 測試 R2 CORS 與預簽 URL。
6. 依上線清單驗證離線重試、雙分頁衝突及 PNG/PDF 匯出；若啟用備份限制，另依備份指南同步 Inngest 的延後備份與每日清理工作。
7. 檢查 Vercel logs 沒有印出 JWT、refresh token、Gemini Key 或 database URL。

## 自訂網域與 Cookie

目前 frontend 與 backend 是同一個主網域下的子網域，請在 Vercel 分別將自訂網域綁定到兩個 Project，並讓 backend Project 的 Domain 對應 `api.context-flow.fengyenchia.com`。部署後確認 CORS 的 `FRONTEND_URL` 與前端 API base URL 完全一致，且路徑保留 `/api`、不要加 `/v1`。

Refresh cookie 使用 `SameSite=Lax`。請以以上同站 HTTPS 自訂網域驗收；不要把兩個獨立 `*.vercel.app` 預覽網址視為等價設定。它們可能被瀏覽器視為跨站，使重新整理時無法帶上 cookie；若要採跨站部署，需要另外規劃同源代理或完整 cookie／瀏覽器政策，不能只改 CORS 就視為完成。

## Resend 寄信設定

1. 在 Resend Dashboard 的 **Domains** 新增 `fengyenchia.com`（或專用寄信子網域，例如 `mail.fengyenchia.com`）。
2. 將 Resend 顯示的 SPF、DKIM DNS records 加到網域 DNS，等待狀態變成 **Verified**。
3. 在 **API Keys** 建立 key。建議選 **Sending access**，並限制只能寄送已驗證的網域；API key 只會完整顯示一次，請立即保存。
4. 將 key 與寄件人寫入 backend Project 的 Vercel Environment Variables：

```dotenv
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=ContextFlow <noreply@fengyenchia.com>
PUBLIC_APP_URL=https://context-flow.fengyenchia.com
FRONTEND_URL=https://context-flow.fengyenchia.com
```

註冊驗證信與忘記密碼信都由 backend 發送。沒有設定 `RESEND_API_KEY` 時，開發模式會把驗證連結印在 backend console，不會真的寄信。

## 官方設定參考

- [Monorepo 與 workspace 偵測](https://vercel.com/docs/monorepos)
- [Root Directory 以外的來源檔案](https://vercel.com/docs/monorepos/monorepo-faq)
- [套件管理器偵測與 override 注意事項](https://vercel.com/docs/package-managers)
- [Corepack 版本釘選](https://vercel.com/docs/builds/configure-a-build#corepack)
- [Node.js 版本設定](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
