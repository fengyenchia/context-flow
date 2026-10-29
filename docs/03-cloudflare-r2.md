# Cloudflare R2 檔案保存

原始檔案保存於私人 bucket，透過預簽網址上傳與下載。

## 平台設定

在 Cloudflare Dashboard → R2 建立私人 bucket，建立只限該 bucket 的 Object Read & Write token。將值放入 backend/.env.local 或 Vercel Backend：

```dotenv
R2_ACCOUNT_ID=
R2_BUCKET_NAME=context-flow-production
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Bucket CORS 範例（將正式網域換成你的前端）：

`AllowedOrigins` 必須包含前端的完整 origin，不加路徑或結尾 `/`。若 API 預簽成功但 R2 PUT 出現 `Failed to fetch`，先檢查 CORS 預檢，再檢查憑證與網路；不要公開 bucket 來繞過問題。

```json
[{
  "AllowedOrigins": ["http://localhost:3000", "http://127.0.0.1:3000", "https://context-flow.fengyenchia.com"],
  "AllowedMethods": ["PUT", "GET", "HEAD"],
  "AllowedHeaders": ["Content-Type"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

## 上傳與下載流程

1. POST /api/projects/:projectId/files/upload：檢查專案寫入權限（工作區成員或已接受的專案邀請）、非空白及 20 MB 限制，保留 pending 檔案紀錄，回傳 10 分鐘有效的預簽 PUT URL。
2. 前端直接 PUT 原始檔案到 R2，秘密不會進入瀏覽器。
3. POST /api/files/:id/complete：後端用 HEAD 檢查實際大小，才將紀錄設為 ready。
4. 資料池保存 r2://檔案ID，而不是會過期的預簽 URL。
5. GET /api/files/:id/download：再次檢查專案權限，回傳 3 分鐘有效的私人下載 URL。

未完整上傳的檔案不開放下載。程式不解析 PDF、不切片、不送出 RAG 索引工作。Inngest 只負責另行啟用的備份及清理。

更換 token 後，先以新部署確認上傳、下載、備份及附件還原，再撤銷已核對不用的舊 token；比對 Access Key ID，不憑 token 名稱猜測。通知與撤銷步驟見[維運指南](19-operations.md)。

## 刪除專案後清理原始檔

刪除專案會先提交 Neon 交易，移除專案與檔案紀錄；API 不在交易完成前刪除 R2 物件。交易失敗時資料回滾，原檔仍保留。清理每日掃描 bucket，不依賴刪除請求是否成功送出排程事件，因此也能處理啟用前留下的已刪除專案原檔。

### 規則

- 只處理 `R2_BUCKET_NAME` 的 `projects/<projectUUID>/<documentUUID>`，不讀寫備份 bucket 的附件副本。陌生路徑保留待人工核對。
- 首次由 Neon 確認專案不存在時，在 `project-file-cleanup/v1/<projectUUID>.json` 建立寬限期標記。至少 24 小時後才可清理；原始物件本身也必須超過 24 小時，保護較晚完成的預簽上傳。實際清除時間取決於每日掃描、排隊與重試，可能跨多次每日工作，並非刪除後固定 24 小時。
- 每批最多列出／處理 100 個物件，使用最後掃描的 key 接續下一批，刪除中斷可重試。每日台灣時間 11:47 執行 `daily-original-file-cleanup`，由 `original-project-file-cleanup` 分批處理。
- 共用專案備份鎖，與備份／還原協調。刪除前重新查 Neon，不以程序記憶體判定專案是否存在；專案重新出現時停止並重設寬限期。任何 `documents.storageKey` 仍引用的原始物件都保留，包括其他專案的紀錄。
- Neon／R2 讀取失敗、列舉不完整、時間資料無效或鎖定失敗時停止刪除。備份 bucket 誤設為原上傳 bucket 時拒絕清理。正式環境缺少資料庫設定時也拒絕執行。
- 現存專案中已從資料池移除的檔案，以及未完成上傳的紀錄，不在本功能範圍內；只在整個專案不存在時清理其原檔。已還原的新專案有自己的 ID 與附件路徑，會受現存專案檢查保護。
- 寬限期不是使用者可自行復原專案的期限。刪除前先保存原檔、確認備份；刪除後的畫布歷史仍依備份的 50 份／30 天政策處理，不會因清原檔而提前刪除。

### 啟用

1. 先部署新 Backend，維持 `R2_PROJECT_CLEANUP_ENABLED=false`（未設定也視為關閉）。不需 migration、Frontend 變數或新服務。
2. 沿用同一正式 Inngest 的 `INNGEST_EVENT_KEY`、`INNGEST_SIGNING_KEY`。在 Production 對正式 Backend 的 `/api/inngest` 按 Resync，確認新增 `daily-original-file-cleanup`、`original-project-file-cleanup`。
3. 原上傳 bucket 的 token 需可列出、HEAD、寫入標記及刪除物件。不要對整個 `projects/` 設獨立的 R2 到期刪除規則，否則會繞過專案／引用保護；也不要對清理標記設自動到期。bucket 維持私人。
4. Backend / Production 設定 `R2_PROJECT_CLEANUP_ENABLED=true`，重新部署 Ready 後，再 Resync 同一 app。啟用會一併掃描歷史孤立原檔，需要永久保留的檔案先另存。
5. 若要暫停，關閉該旗標並部署，等已開始的一批工作結束。關閉不會還原已刪檔。Neon 還原或人工搬檔期間先暫停清理，完成核對後再啟用。

### 驗收

建立含附件的可刪除測試專案 A，另保留含附件的專案 B；若使用備份，先為 A 立即備份。刪除 A，對這兩個專案各送出一次 `contextflow/files.cleanup-project` 事件，或等既有每日排程；小量驗收不需另啟動全域掃描。A 應先回報 `skipped: grace`，B 回報 `skipped: active`，原檔尚在。以 R2 寬限標記時間確認至少已過 24 小時，再針對同一專案觸發或等每日排程，確認 A 原始路徑的物件已清除、B 仍可下載、備份 bucket 的副本仍在。無符合條件的物件時 `deletedFiles: 0` 正常；`disabled: true` 表示該部署未啟用。

不要為了驗收手動刪除寬限期標記或篡改時間。大量物件、服務失敗、專案重新出現、其他引用及權限／交易回滾由隔離自動測試驗證。備份還原步驟見 [畫布備份](17-canvas-backups.md)。

驗收需同時保留 Inngest 工作結果與清理後的資料檢查：A 的專案／文件紀錄不存在、原檔數為 0；備份 manifest 校驗與附件位元組一致；B 的專案／文件紀錄仍在，原檔數與內容均不變。A 已無原檔時，原檔內容比對為 false 是預期，不代表備份損壞。工作 Completed 本身不能代替物件與內容核對。
