# 上線前操作清單

一般流程已代跑自動驗收，結果見 [驗收報告（更新至 2026-10-24）](12-acceptance-report.md)。不需要再手動重跑所有基本流程；以下主要供真實外部服務與部署驗收時參考。

## 最新驗收狀態（2026-10-24）

使用者已提供 `pnpm test:db` 通過結果，並確認實際 PDF／PNG 下載與內容、重新整理保存、Gemini 生成、郵件收信及 R2 檔案保存成功。這些項目不需重新設定或建立資源；完整證據與範圍見 [驗收報告](12-acceptance-report.md)。目前主要待辦為 Vercel 部署、正式網域及線上環境驗收。

## 已完成項目與部署待辦對照

本機服務變數已有填值，不要重建已有資源或把密鑰貼到對話；填值不代表權限、DNS 或實際服務已驗證。

| 項目          | 你要做什麼                                                                                                                     | 完成後如何確認                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Neon 測試分支 | 已設定專用測試連線，隔離檢查及 `pnpm test:db` 已通過；保留 production `DATABASE_URL` | 獨立程序還原、舊版本拒絕與原子回滾通過；probe 的 skipped 為預期設計 |
| Resend        | 使用者已確認實際收信成功 | 重寄、忘記密碼與舊連結失效可另作進階抽查，尚無逐項人工回報 |
| R2            | 使用者已確認檔案保存成功 | 部署正式網址時再核對 CORS 與金鑰最小權限 |
| Gemini        | 使用者已確認 Key 儲存及實際生成成功 | 持續觀察收斂來源與語意品質，不宣稱所有額度／提示詞情境已驗收 |
| 瀏覽器匯出與保存 | 使用者已確認 PDF／PNG 下載與內容、重新整理後資料保留成功 | 正式部署後再以正式網址抽查 |
| Vercel／DNS   | 核對兩個 Project 的環境變數、自訂網域、CORS，部署後登入並重新整理                                                              | 正式網址的 refresh cookie 正常；平台 rate limit/WAF 需另設定                          |

RAG、群組、Markdown/JSON/SVG 匯出依決定不做。即時共編、版本歷史、復原/重做等屬尚未選定開發的新功能，不是上述驗收的前提。

程式已補上核心資料保存、安全、管理與檔案流程。以下保留完整設定與日後重驗步驟，不表示全部仍未完成；只補缺少或部署後需重新核對的項目。不要把完整密鑰貼到對話或提交 Git。

先在根目錄執行 pnpm check:env，會列出本機缺少的變數名稱，不會印出密鑰或連線資料庫。正式網址檢查可用 pnpm check:env -- --production；Vercel 上的設定仍需自行確認。

本次已確認本機必要變數都有填值，因此已有的 bucket、金鑰、網域不必重建；以下先核對有效性與正式環境是否一致，再補缺少的設定。

## 1. Neon：先備份，再執行 migration

2026-10-23 執行結果：使用者已確認備份完成；已使用原本 production `DATABASE_URL` 成功套用 `0004_needy_maddog`，沒有切換備份分支或修改連線設定。套用前後連線指紋一致、既有 14 張資料表筆數完全一致；新表的 6 個欄位、主鍵、token hash 唯一約束與 users 外鍵均已確認。

歷史注意：production 的 `0003` 已套用，但其紀錄 hash 與目前本機封存版不同，且原 `app_state` 與封存表都不存在。本次未重跑 `0003`、未改寫 migration ledger，也沒有復原舊表。此差異是既有歷史狀態，不是此次 `0004` 刪除資料。

以下為日後部署其他環境的步驟；本次 production migration 已完成。

1. 在 Neon Console 建立目前資料庫的 branch/備份。
2. 確認 backend/.env.local 的 DATABASE_URL 指向正確資料庫。
3. 在專案根目錄執行：

```sh
pnpm --filter @context-flow/backend db:migrate
```

Drizzle 設定已支援讀取 backend/.env.local 與 .env。程式需要 0004_needy_maddog.sql 的 email_verification_tokens 表；未完成前資料 API 可能回報 503。

0003 不再直接 DROP app_state，而是將尚存在的舊表改名 app_state_legacy_backup，以保留核對來源；程式不會使用此封存表。若舊的 DROP migration 已執行，這次更改無法復原已刪除的資料。

可在 SQL Editor 以 SELECT count(*) 檢查 users、workspaces、workspace_members、projects、canvas_nodes、canvas_edges、canvas_resources、canvas_messages、canvas_summaries 與 email_verification_tokens。新 token 表在註冊/重寄前為空是正常的，空專案也不要求每張表都有資料。

## 2. 真實資料庫測試：只用專用測試分支

在 Neon 另建可丟棄的測試 branch，將連線字串放入 backend/.env.test.local：

```dotenv
TEST_DATABASE_URL=postgresql://你的專用測試分支
```

然後執行：

```sh
pnpm check:test-db # 只檢查 URL 目標是否隔離，不連線、不遷移
pnpm test:db       # 確認可丟棄 branch 後才執行
```

腳本會先遷移該測試分支，再驗證完整畫布的還原、驗證 token 保存、舊版本拒絕與交易回滾；另啟獨立 Node/Vitest 程序讀回節點、圖片內容、連線、資料池及對話，確認不是同一程序的記憶體快取。最後只清理測試自己建立的使用者及其關聯資料。

腳本不修改原本的 production 環境設定；只在測試子程序使用測試連線，並停用寄信、R2 與管理員初始化。它會拒絕相同目標、Neon pooled／非 pooled 別名、只改使用者／查詢參數的網址與可覆寫目標的參數；直接繞過腳本啟動 DB Vitest 也會被擋下。URL 比對無法證明任意 DNS 別名或兩個 endpoint 是否位於同一 branch，仍需你在 Neon Console 確認這真的是獨立可丟棄分支。

## 3. Resend：實際寄信

1. 在 Resend 驗證寄件網域，將平台列出的 SPF/DKIM 等記錄填入 DNS。
2. 建立寄信用 API Key。
3. 在 backend 本機或 Vercel 設定 RESEND_API_KEY、EMAIL_FROM、PUBLIC_APP_URL。
4. 註冊測試帳號，實際收信並點擊驗證連結；再測試重寄驗證信及忘記密碼。
5. 正式環境不會退回 console 寄信模式；缺少設定會顯示寄送失敗。

詳見 [部署指南](08-vercel-deployment.md)。

## 4. Cloudflare R2：實際上傳與下載

建立私人 bucket 與限定該 bucket 的 Object Read/Write token，設定：

```dotenv
R2_ACCOUNT_ID=
R2_BUCKET_NAME=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

依 [R2 指南](03-cloudflare-r2.md) 設定 CORS。選擇一個小 PDF 與圖片上傳，確認資料池出現檔案後可以下載原始內容。重載與 backend 重啟後再下載一次；未完整上傳的檔案不會開放下載。

沒有設定 R2 時，檔案按鈕會回報設定錯誤，不再只存檔名並假裝上傳完成。文字與一般連結不需要 R2。RAG/文件解析不在這個流程內。

## 5. Vercel：部署與網域

1. Frontend/Backend 各設一個 Vercel Project，Root Directory 分別是 frontend、backend。
2. 設定正式 DATABASE_URL、JWT_ACCESS_SECRET、JWT_REFRESH_SECRET、USER_API_KEY_ENCRYPTION_KEY 與寄信/檔案服務變數。
3. 設定 FRONTEND_URL、PUBLIC_APP_URL、NEXT_PUBLIC_API_BASE_URL；前端公開變數不可放秘密。
4. 綁定網域並重新部署兩個 Project。
5. /api/health 只表示服務與變數配置，不代表資料庫、R2 或寄信服務已通過實際請求驗證。
6. 公開上線時，另於平台設定跨實例的登入 rate limit/WAF；目前程式限流是單一後端實例的保護。

## 6. 你在瀏覽器的驗收順序

以下供**部署到正式網址後**抽查；本機已通過的基本流程不必全部手動重跑。現在優先完成上方對照表的 Vercel／DNS 待辦。

用可刪除的測試資料操作：

- 註冊、驗證、登入；個人工作區新增專案。
- 建立共享工作區、邀請第二帳號；確認 viewer 可讀，沒有新增/清除節點與資料池寫入控制。
- 將 viewer 改為 editor，確認可保存；測試移除與離開工作區。
- 修改專案名稱/說明；用測試專案輸入名稱確認刪除。
- 三區新增節點、改色、連線、重載；確認資料與畫面一致。
- 在 DevTools Network 切 Offline，修改節點，確認顯示儲存失敗；恢復 Online 後按重試，再重載確認。
- 開兩個分頁：一方先保存，另一方再修改，應出現衝突而不覆蓋。先手動複製第二方未儲存的文字，必要時匯出 PNG，再重載；目前不提供 JSON 匯出或自動合併。
- 將節點拖到畫面外/負座標，展開三區後匯出 PNG/PDF；PNG ZIP 應含資料池與三區的分片圖片，PDF 應依區域分頁而非全部縮成一頁。相鄰片有重疊區以便對照，確認顏色/連線保留，且編輯畫面不變。PDF 請選 A4 橫式、儲存為 PDF，關閉瀏覽器頁首頁尾。
- 設定自己的 Gemini Key，實際測試對話、發散節點與收斂結果；這需要有效 Key/額度，本機無 Key 的自動測試不會呼叫 Gemini。

Liveblocks 即時共編尚未接入，不需要先花時間設定它；Inngest/RAG 也不是本次驗收前提。
