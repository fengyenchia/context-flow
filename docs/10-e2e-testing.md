# 自動化測試

## 指令與範圍

| 指令 | 範圍 |
| --- | --- |
| `pnpm test` | 前後端單元測試：持久化交易、節點位置、匯出座標、檔案確認與登入狀態 |
| `pnpm test:e2e:api` | 註冊、驗證、登入、工作區、角色權限、專案、畫布保存與錯誤回滾 |
| `pnpm exec playwright test e2e/collaboration.spec.ts` | 雙使用者 CRDT 合併、三區／資料池／連線同步、離線重連與唯讀角色；使用隔離 WebSocket fixture |
| `pnpm exec playwright test e2e/canvas-backups.spec.ts` | 備份清單、立即備份、錯誤重試、還原確認／導向新專案、Esc／焦點與唯讀角色；API 使用替身 |
| `pnpm exec playwright test e2e/project-invites.spec.ts` | 建立連結、登入導回、接受與重試、受邀清單、檢視／編輯與正在開啟中的撤權 |
| `node scripts/test-db.mjs --collaboration-only` | 專用 Neon 測試連線的跨連線 advisory lock；無 migration、無應用資料表讀寫 |
| `pnpm test:e2e` | Chromium 瀏覽器流程：登入、畫布編輯、重載、匯出、視窗操作、離線與雙分頁衝突 |
| `pnpm exec playwright test e2e/home.spec.ts` | 首頁 GSAP 動態、捲動按鈕、FAQ、換頁清理、手機排版、深色模式與減少動態設定 |
| `pnpm exec playwright test e2e/onboarding.spec.ts` | 新註冊教學啟用、工作區接續畫布、跳過／重看／返回／Esc、收合區域、手機深色模式與唯讀角色；API 使用替身，不呼叫付費 AI |
| `pnpm check:test-db` | 離線檢查測試庫與正式庫是否隔離，不連線或執行 migration |
| `pnpm test:db` | 專用 Neon 測試庫的 migration、跨程序還原、驗證 token、版本衝突與交易回滾 |
| `pnpm test:secrets` | 密鑰掃描工具的隔離測試 |
| `pnpm check:secrets -- --staged --history` | 暫存區與本機 Git 歷史的敏感資料掃描 |

首次執行瀏覽器測試前安裝 Chromium：

```sh
pnpm exec playwright install chromium
```

單獨檢查圖片匯出：

```sh
pnpm exec playwright test e2e/export-flow.spec.ts
node scripts/check-export-render.mjs
```

PNG 測試檢查 ZIP 分片、尺寸、節點底色、文字像素及缺圖處理，並確認原畫布不變。PDF 測試檢查匯出內容，不操作作業系統列印視窗；實際列印與生成品質依 [功能驗收](12-acceptance-report.md) 人工確認。

## 隔離

- 瀏覽器測試自動啟動前端 `127.0.0.1:3100`、後端 `127.0.0.1:3101`；埠須未被使用。
- 測試使用獨立 `.next-e2e` 建置，覆蓋本機資料庫、R2、寄信及初始管理員設定，不使用正式帳號或資源。
- API 測試使用記憶體資料、郵件、Gemini 及 Liveblocks SDK 替身，不發出真實寄信、雲端共編或付費 AI 請求。測試啟動器清空 Liveblocks 密鑰並停用共編旗標，個別共編測試才注入替身。
- 備份 API 測試用官方 Webhook 簽章驗證器與真正的 Yjs 文件，R2／Liveblocks／Inngest 使用替身；檢查跨專案隔離、角色、失敗重試、附件還原、去重、15 分鐘間隔、50 份／30 天限制及安全清理。單元測試另驗證延後與每日排程；`node scripts/test-db.mjs --collaboration-only` 同時檢查共編與備份的 Neon 跨連線鎖，不執行 migration 或修改應用資料表。真實服務設定與交付驗收見 [畫布備份](17-canvas-backups.md)。
- 專案邀請 API 測試檢查期限、撤銷、聯集授權與工作區／專案隔離。Neon 測試另驗證新資料表 migration、獨立重新載入後的角色／撤銷保存；正式啟用步驟見 [專案邀請](18-project-invitations.md)。
- 原始檔清理 API 測試檢查 owner 刪除／editor 拒絕、交易失敗回滾、首次確認後 24 小時、延遲上傳、跨專案引用、備份與還原路徑保護、分批續跑、失敗重試及停用旗標。單元測試檢查新鮮 Neon 查詢與 Inngest 每日／接續工作，使用 R2 替身與模擬時間，不等待一天、不刪正式檔案。設定後的真實服務驗收見 [R2](03-cloudflare-r2.md#驗收)。
- 瀏覽器測試從開發郵件日誌取得驗證連結，再操作正常的 Email 驗證頁。
- `pnpm test:db` 另讀取 `backend/.env.test.local` 的 `TEST_DATABASE_URL`，只允許獨立、可丟棄的 Neon 分支。
- DB 測試以獨立 Node 程序重新連線驗證保存結果；父程序的 probe 依設計跳過，由子程序執行。
- 記憶體模式的保存／重載不代表 Neon 跨程序持久化驗證。真實配額、寄信、R2 與 AI 內容需另外驗收。

## 產物

| 位置 | 用途 |
| --- | --- |
| `.e2e/` | 測試伺服器日誌與截圖 |
| `playwright-report/` | Playwright 報告 |
| `test-results/` | 失敗截圖與 trace |
| `output/` | 匯出與渲染檢查產物 |

以上產物不加入 Git，可於測試結束後刪除。使用 `pnpm exec playwright show-report` 開啟最近一次報告。
