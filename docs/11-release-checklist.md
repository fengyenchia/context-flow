# 上線檢查清單

## 部署與設定

- [ ] 前後端建置成功，正式網域與 HTTPS 正常。
- [ ] 無痕視窗可開啟首頁與 `/api/health`；API 不被 Vercel 平台登入攔截。
- [ ] 前端 API 位址、Backend CORS 與郵件連結使用正確的正式網域。
- [ ] Production 與 Preview 的資料庫、寄信及儲存資源隔離。
- [ ] 密鑰僅放 Backend；環境檔、日誌及測試產物未加入 Git。
- [ ] 管理員已設定，初始化變數已移除。

## 資料與檔案

- [ ] Migration 已套用並核對 ledger，不修改或重跑已套用版本。
- [ ] 資料庫備份保留政策與還原步驟已確認。
- [ ] 若啟用即時共編，依 [共編指南](16-realtime-collaboration.md) 確認 Liveblocks 資料保存／備份、環境隔離及切換步驟；Neon 舊快照不能當成最新畫布備份。
- [ ] 若啟用畫布備份，依 [備份指南](17-canvas-backups.md) 確認獨立私人 bucket、Webhook 成功交付、版本保留期限與還原成新專案；立即備份成功不等於 Webhook 已通。
- [ ] 若啟用專案邀請，先套用 0005，再設定 `PROJECT_INVITES_ENABLED=true`；驗收非成員只存取一個專案及即時撤權，見 [邀請指南](18-project-invitations.md)。
- [ ] R2 bucket 私有，token 僅授予必要 bucket 權限。
- [ ] R2 CORS 包含正式前端來源，檔案上傳與下載成功。
- [ ] 加密金鑰安全保存；既有資料可正常解密。

## 功能與防護

- [ ] 依 [驗收項目](12-acceptance-report.md) 完成帳號、畫布、檔案及共享流程。
- [ ] Backend 平台限流已設定並觀察正常流量，見 [防護指南](15-backend-security.md)。
- [ ] API 未使用互動式 Challenge／Redirect，避免阻擋正常請求。
- [ ] 錯誤、用量與費用通知已設定。
- [ ] 部署日誌未包含密碼、token、API Key 或資料庫連線字串。

正式站只做小量功能抽查；壓力測試與超限測試應在隔離環境執行。

設定方式見 [部署指南](08-vercel-deployment.md) 與 [Neon 指南](02-neon-database.md)。
