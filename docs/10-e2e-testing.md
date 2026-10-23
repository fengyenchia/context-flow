# 自動化測試

## 指令與範圍

| 指令 | 範圍 |
| --- | --- |
| `pnpm test` | 前後端單元測試：持久化交易、節點位置、匯出座標、檔案確認與登入狀態 |
| `pnpm test:e2e:api` | 註冊、驗證、登入、工作區、角色權限、專案、畫布保存與錯誤回滾 |
| `pnpm test:e2e` | Chromium 瀏覽器流程：登入、畫布編輯、重載、匯出、視窗操作、離線與雙分頁衝突 |
| `pnpm exec playwright test e2e/home.spec.ts` | 首頁導覽、FAQ、footer、手機排版、深色模式與鍵盤操作 |
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
- API 測試使用記憶體資料、郵件與 Gemini SDK 替身，不發出真實寄信或付費 AI 請求。
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
