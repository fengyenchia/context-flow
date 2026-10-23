# 上線收尾清單

更新：2026-10-24。已完成的基本流程不需全部重跑，證據與邊界見 [驗收報告](12-acceptance-report.md)。

## 已完成

- 使用者確認前後端 Vercel Ready、正式網域及 API health 正常。
- 專用 TEST_DATABASE_URL、隔離檢查與真實 DB 持久化測試已有通過回報。
- 登入／重載、節點文字／顏色／位置／連線、檔案保存與下載、PDF／PNG、Gemini 基本生成。
- 共享角色、雙分頁衝突、離線重試，以及郵件與密碼重設驗收。
- R2 CORS 已加入正式前端來源，使用者確認正式上傳成功。

## 需要你在瀏覽器設定／確認

| 項目 | 驗收邊界 |
| --- | --- |
| Backend WAF／限流 | 依 [15 防護指南](15-backend-security.md) 建立規則，先確認方案／費用與 Log，再決定發布阻擋；目前未回報完成 |
| R2 與 Preview | bucket 私有、token 僅限必要 bucket；Preview 不使用 production DB／郵件／R2 secrets |
| 公開訪客 | 未登入 Vercel 的無痕視窗可開正式首頁與 health；專案仍需應用程式授權 |
| 專案管理抽查 | 空白測試專案更名／刪除後，舊網址不可存取；尚無逐項正式站回報 |
| 維運 | 備份保留與還原步驟、錯誤／用量通知、適用方案的費用控制；不自動購買服務 |

不要在正式站大量寄信或撞登入次數來測 WAF。設定先用 Log 觀察正常流程；流量壓測與封鎖測試另排隔離環境／時段。

## 不需要再做

- 不重建現有 Neon、R2、Resend 資源，不重跑已完成的 production migration。
- 不更換原本 DATABASE_URL 或 USER_API_KEY_ENCRYPTION_KEY，不把 TEST_DATABASE_URL 放進 Vercel。
- 不啟用未接入的 Liveblocks／Inngest，不恢復已取消的群組／匯出格式。
- 不把整個 Backend 改成需登入 Vercel，或對 fetch API 啟用互動式 Challenge 來代替應用程式權限。

新環境設定見 [部署指南](08-vercel-deployment.md)，備份／migration 注意事項見 [Neon](02-neon-database.md)。文件不保存密鑰、cookie、HAR 或預簽網址。
