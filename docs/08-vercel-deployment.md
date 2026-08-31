# Vercel 部署

建議同一 Git repository 建立兩個 Vercel Project，分別指定 Root Directory。

## Frontend Project

- Root Directory：`frontend`
- Framework：Next.js
- Build Command：`pnpm build`
- Environment Variable：

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://你的-backend.vercel.app/api
```

## Backend Project

- Root Directory：`backend`
- Framework：Next.js
- Build Command：`pnpm build`
- Environment Variables：複製 `backend/.env.example` 中的正式值
- `NODE_ENV=production`
- `FRONTEND_URL=https://你的-frontend.vercel.app`；多個 origin 用逗號分隔

Backend production 至少需要 JWT secrets、`DATABASE_URL` 與 API Key encryption key；依功能再加入 R2、Liveblocks、Inngest。

> [!CAUTION]
> 目前 repository 尚未將業務 service 接到 Neon。部署 backend 雖可啟動，但 serverless instance 的 memory 資料會消失且不同 instance 不共享。完成 Neon repository 與整合測試前，不可提供正式使用者使用。

## 部署後檢查

1. 打開 `https://backend/api/health`，確認 integration 狀態。
3. 從 frontend 註冊、登入並 refresh 頁面。
4. 建立兩個使用者，測試邀請與 viewer 權限。
5. 測試 Gemini Key 儲存與 AI request。
6. 測試 R2 CORS 與預簽 URL。
7. 在 Inngest Dashboard sync backend endpoint。
8. 檢查 Vercel logs 沒有印出 JWT、refresh token、Gemini Key 或 database URL。

## 自訂網域與 Cookie

同站子網域（例如 `app.example.com`、`api.example.com`）管理較簡單。若 frontend/backend 是跨站網域，需重新評估 `SameSite`、CORS 與 CSRF；不要只把 cookie 改成 `SameSite=None` 就上線。
