# Vercel 部署

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
- `NODE_ENV=production`
- `FRONTEND_URL=https://context-flow.fengyenchia.com`
- `PUBLIC_APP_URL=https://context-flow.fengyenchia.com`
- `RESEND_API_KEY=re_...`（只放 backend，不要加 `NEXT_PUBLIC_`）
- `EMAIL_FROM=ContextFlow <noreply@fengyenchia.com>`（寄件網域必須先在 Resend 驗證）

Backend production 至少需要 JWT secrets、`DATABASE_URL` 與 API Key encryption key；依功能再加入 R2、Liveblocks、Inngest。

> [!CAUTION]
> 目前 repository 尚未將業務 service 接到 Neon。部署 backend 雖可啟動，但 serverless instance 的 memory 資料會消失且不同 instance 不共享。完成 Neon repository 與整合測試前，不可提供正式使用者使用。

## 部署後檢查

1. 打開 `https://api.context-flow.fengyenchia.com/api/health`，確認 integration 狀態。
2. 從 frontend 註冊、登入並 refresh 頁面。
3. 建立兩個使用者，測試邀請與 viewer 權限。
4. 測試 Gemini Key 儲存與 AI request。
5. 測試 R2 CORS 與預簽 URL。
6. 在 Inngest Dashboard sync backend endpoint。
7. 檢查 Vercel logs 沒有印出 JWT、refresh token、Gemini Key 或 database URL。

## 自訂網域與 Cookie

目前 frontend 與 backend 是同一個主網域下的子網域，請在 Vercel 分別將自訂網域綁定到兩個 Project，並讓 backend Project 的 Domain 對應 `api.context-flow.fengyenchia.com`。部署後確認 CORS 的 `FRONTEND_URL` 與前端 API base URL 完全一致，且路徑保留 `/api`、不要加 `/v1`。

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
