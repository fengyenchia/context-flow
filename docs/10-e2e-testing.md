# 自動化驗證

目前最新的正式站人工回報集中在 [驗收結果](12-acceptance-report.md)。下列測試仍使用其各自隔離設定，不會因正式站驗收完成而改連 production。

## 指令

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
pnpm test:e2e:api
pnpm test:e2e
pnpm test:db # 需先設定專用測試分支的 TEST_DATABASE_URL
pnpm check:test-db # 離線檢查隔離，不會連線或執行 migration
pnpm test:secrets
pnpm check:secrets -- --staged --history
```

`pnpm test` 分別執行 backend 與 frontend 的單元測試，不會先 build，也不會跨套件掃描測試。前端包含新增節點位置的回歸測試，檢查空畫布、量測高度、多節點碰撞與獨立水平分支。

`pnpm test:e2e:api` 驗證真實路由處理器的註冊、Email 驗證、登入、個人工作區、共享工作區、專案、三區畫布快照、權限拒絕、refresh token 輪替與登出。郵件使用測試替身，資料使用記憶體。

目前也包含重寄驗證信、成員角色/離開、專案編輯刪除、viewer 禁寫、儲存失敗回滾、舊畫布版本拒絕與未設定 R2 的錯誤流程。單元測試另驗證交易範圍、還原、檔案大小確認、refresh 合併、匯出座標與節點不重疊。

pnpm test:db 會在 TEST_DATABASE_URL 的專用分支遷移 schema，驗證資料還原、驗證 token、資料庫衝突與交易回滾；不包含在一般 pnpm test，避免意外寫入現有資料。

DB 測試現會額外啟動獨立 Node/Vitest 程序，重新連線讀回已提交的圖片內容、節點、連線、資料池、對話與驗證 token。父程序中的 probe 項目依設計跳過，由子程序單獨執行；不能把尚未設定連線的測試當作已通過。入口會排除 production 與 pooled／非 pooled 別名，限制覆寫連線目標的參數，並拒絕未經 guard 的直接 DB Vitest 執行；仍須人工確認 Neon branch 的用途。

API 測試使用模擬 Gemini SDK，涵蓋 Key 驗證、加密／遮蔽、更換失敗不覆蓋、刪除、專案權限、空白問題，以及額度／權限／模型／暫時故障的安全錯誤回覆。這些不會發出付費請求，也不代表真實 Key、配額或生成內容品質已驗收。

`pnpm test:e2e` 使用 Chromium 操作實際前後端，涵蓋註冊、驗證連結、登入、個人/共享工作區建立專案、資料池、三區節點、實際雙擊節點編輯、底色、自動儲存、重載、節點不重疊、顏色/連線還原、連線文字編輯、PNG 分區 ZIP 內容及畫布不變、登出保護，以及錯誤密碼提示。也會檢查瀏覽器執行錯誤、API 500 與已知 React hooks/root 警告。PDF 的實際列印對話框仍需人工驗收。

PNG 測試會解開 ZIP，檢查圖片尺寸、節點底色與文字像素，並偵測 SVG 標籤的黑色遮字方塊，不只確認下載成功。離線定位煙霧測試可執行 `node scripts/check-export-render.mjs`，不需啟動網站或連資料庫。

可單獨執行 `pnpm exec playwright test e2e/export-flow.spec.ts` 驗證圖片匯出：先重現過期 `blob:` 圖片導致 html-to-image 拋出非 Error 事件，再測試缺圖時 PNG ZIP/PDF 仍完成、警告與分片尺寸、原畫布不被修改，以及實際選取本機圖片後保存/重載仍可匯出。PDF 測試只攔截系統列印視窗；實際匯出 iframe 內容另經 Chromium 產生 `output/pdf/export-recovered.pdf` 供渲染檢查。

完整主流程含大型 PNG 分片、PDF、離線與雙分頁衝突，標記為長測試；單步等待上限不變。

工作區視窗測試包含：新增/編輯/刪除專案視窗、邀請成員視窗、成員 API 延遲時立即顯示載入、失敗重試、原生 modal 遮罩、Tab 焦點不離開視窗、Esc 關閉並還原焦點，以及 390px 手機版面。桌面與手機截圖存於 `.e2e/workspace-members-desktop.png`、`.e2e/workspace-members-mobile.png`。

新增驗收也涵蓋：19,000px 以上且含負座標的真實畫布 PNG 分片、瀏覽器 Offline 修改後重試保存與重載、兩個實際分頁的版本衝突拒絕。PDF 測試只攔截作業系統列印視窗，取匯出 iframe 的原始 HTML 交給 Chromium PDF 引擎產生 `output/pdf/canvas-acceptance.pdf`；另檢查頁數、尺寸、逐頁渲染與內嵌圖像底色。這不等同於人工操作系統列印視窗。

## 隔離與結果

2026-10-24 最新補驗收：使用者提供 `pnpm test:db` 終端機結果，migration 成功，主測試 1 項通過（含獨立子程序驗證），父程序的 probe 1 項依設計跳過，總耗時 8.53 秒。使用者亦確認 PDF／PNG 實際下載與內容、重載保存、Gemini 生成、郵件收信及 R2 檔案保存成功。這些為另行執行的 DB 測試與人工回報，不代表下列隔離 Chromium 測試改用真實服務；詳見 [驗收報告](12-acceptance-report.md)。

- 測試自動啟動 `127.0.0.1:3100`（前端）與 `127.0.0.1:3101`（後端），埠必須未被使用。
- 使用獨立 `.next-e2e` 輸出，空的 `DATABASE_URL`、R2、郵件服務與初始管理員環境變數覆蓋本機 `.env`。不使用 Neon 的現有帳號、資料、真實 bucket 或真實郵件。
- 測試以開發郵件日誌取得驗證連結，再操作真正的 Email 驗證頁；沒有繞過驗證的測試 API。
- `.e2e/` 儲存伺服器日誌；`playwright-report/` 儲存報告；失敗畫面與 trace 位於 `test-results/`。以上產物不進 Git。
- 重載驗證涵蓋 HTTP 自動儲存與重新讀取，**不代表通過 Neon 重啟持久化驗證**；真實資料庫整合應另使用專用測試資料庫執行。
- 此流程不呼叫 Gemini、R2 或 Inngest；RAG 仍暫緩。

可使用 `pnpm exec playwright show-report` 開啟最近一次報告。
