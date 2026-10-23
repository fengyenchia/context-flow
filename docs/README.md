# 文件索引

更新：2026-10-24。只保留現行設定、部署、防護與驗收說明；舊草稿與分輪操作紀錄已移除。

| 需求 | 文件 |
| --- | --- |
| 專案介紹、啟動與常用指令 | [根目錄 README](../README.md) |
| 本機安裝與開發模式 | [01 本機開發](01-local-development.md) |
| Neon、migration 與測試連線 | [02 Neon](02-neon-database.md) |
| R2 上傳／下載與 CORS | [03 R2](03-cloudflare-r2.md) |
| 使用者 Gemini Key | [04 Gemini](04-gemini-api-key.md) |
| JWT、管理員與密碼重設 | [07 帳號安全](07-jwt-and-admin.md) |
| Vercel 與正式網域 | [08 部署](08-vercel-deployment.md) |
| 已實作／暫緩／限制 | [09 功能現況](09-product-status.md) |
| 自動測試與隔離 | [10 測試](10-e2e-testing.md) |
| 尚待設定／確認的事項 | [11 收尾清單](11-release-checklist.md) |
| 最新人工與自動驗收範圍 | [12 驗收報告](12-acceptance-report.md) |
| Backend Firewall／限流 | [15 防護設定](15-backend-security.md) |

目前前後端已部署、正式網域及核心功能經使用者確認。不要重建已存在的雲端資源、重新產生現有加密 key 或重跑 production 歷史 migration。序號保留，05／06／13／14 已移除，不補不存在的功能。

所有密鑰與連線字串只放本機環境檔或平台環境變數，不貼進文件、Git 或對話。
