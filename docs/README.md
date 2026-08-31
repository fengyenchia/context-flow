# ContextFlow 設定文件

建議依序完成：

1. [本機開發](01-local-development.md)：先用 memory mode 確認登入、工作區及專案畫布。
2. [Neon](02-neon-database.md)：建立正式 PostgreSQL（目前 repository 尚待接線）。
3. [Gemini](04-gemini-api-key.md)：讓使用者在介面自行設定 AI Key。
4. [R2](03-cloudflare-r2.md)、[Liveblocks](05-liveblocks.md)、[Inngest](06-inngest.md)：依功能逐一啟用。
5. [JWT 與管理員](07-jwt-and-admin.md)：產生正式 secrets 與管理員密碼雜湊。
6. [Vercel](08-vercel-deployment.md)：建立前後端兩個 Project。

每份文件都標示要放進 `frontend/.env.local` 或 `backend/.env.local` 的變數。請勿把真實密鑰寫進文件或 Git。
