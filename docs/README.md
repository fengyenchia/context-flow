# ContextFlow 設定文件

建議依序完成：

開始閱讀產品現況與未完成項目：[功能盤點與開發狀態](09-product-status.md)。
需要操作雲端平台與瀏覽器的步驟：[上線前操作清單](11-release-checklist.md)。
最近一次實際執行結果：[驗收報告（更新至 2026-10-24）](12-acceptance-report.md)。
介面精簡與檔案清理範圍：[介面與目錄清理](13-interface-cleanup.md)。
本機提交與密鑰檢查範圍：[Git 與部署前檢查](14-git-release-preflight.md)。

1. [本機開發](01-local-development.md)：先用 memory mode 確認登入、工作區及專案畫布。
2. [Neon](02-neon-database.md)：正規化保存已接線；正式庫 migration 與專用測試分支的持久化整合測試已完成。
3. [Gemini](04-gemini-api-key.md)：使用者已確認 Key 儲存與實際生成成功。
4. [R2](03-cloudflare-r2.md)：使用者已確認檔案保存成功；郵件實際收信、PDF／PNG 匯出及重載保存亦已確認，範圍見驗收報告。[Liveblocks](05-liveblocks.md) 尚未接入即時共編，[Inngest](06-inngest.md)/RAG 也不是本版本驗收前提。
5. [JWT 與管理員](07-jwt-and-admin.md)：產生正式 secrets 與管理員密碼雜湊。
6. [Vercel](08-vercel-deployment.md)：建立前後端兩個 Project。

每份文件都標示要放進 `frontend/.env.local` 或 `backend/.env.local` 的變數。請勿把真實密鑰寫進文件或 Git。
