# 畫布備份與還原

## 保存方式

Liveblocks 仍是共編畫布的主要資料來源。收到已簽章的 `ydocUpdated` Webhook 後，Backend 讀取最新 Yjs 文件，將完整文件、專案資料和附件清單壓縮保存到獨立的私人 R2 bucket。附件另存一份，不依賴原上傳物件。這不會把舊版快照寫回正在使用的畫布。

涵蓋資料池、資料架構／發散／收斂節點、底色、位置、連線及文字、對話、總結與已完成上傳的附件。外部網址的內容不會下載備份；外部圖片失效仍需補圖。帳號、工作區與成員權限仍須由 Neon 備份保護。

Webhook 通知有節流，因此不是每次按鍵都會產生一份備份，也不是「已同步」就已另存備份。預設通知頻率依 Liveblocks 方案；目前官方文件說明一般為最多每 60 秒通知一次。失敗回覆 503，讓 Liveblocks 重試；重送同一通知不會覆蓋已完成的版本。超過平台重試期限仍失敗時，需要管理者在 Webhooks 後台查看失敗記錄、修復後重送。

## 服務設定

基本備份只需要 R2 與 Liveblocks Webhook；保留限制、自動清理及延後備份另外使用 Inngest。不需要 migration，不新增 Frontend 變數。`DATABASE_URL` 保持原本 production 連線。

1. 在現有 Cloudflare R2 帳號建立獨立 bucket，例如 `context-flow-canvas-backups`。關閉公開存取，不啟用 `r2.dev` 或公開自訂網域。備份不經瀏覽器，不需要 CORS。
2. Backend 的 R2 API token 需能讀寫原檔案 bucket 與備份 bucket，包含列出物件及跨 bucket 複製。若原 token 只授權一個 bucket，需擴充範圍或更換 token；只更新 Backend 的 R2 credentials，不貼到對話或 Git。
3. Vercel **Backend / Production** 新增：

   | 變數 | 值 |
   | --- | --- |
   | `CANVAS_BACKUP_ENABLED` | `true` |
   | `CANVAS_BACKUP_BUCKET_NAME` | 新私人 bucket 名稱，必須與 `R2_BUCKET_NAME` 不同 |
   | `LIVEBLOCKS_WEBHOOK_SECRET` | Liveblocks Webhooks endpoint 的 Signing secret，設為敏感值 |

   保留原本 `COLLABORATION_ENABLED=true`、`LIVEBLOCKS_SECRET_KEY` 及 R2 設定。
4. 在同一個正式 Liveblocks 專案的 Webhooks 新增 endpoint：`https://你的正式Backend網域/api/webhooks/liveblocks`，只訂閱 `ydocUpdated`。將該 endpoint 的 Signing secret 填入上述變數，重新部署 Backend。Frontend 也要部署包含備份入口的版本。
5. 若 Vercel Deployment Protection 或 WAF 阻擋這個 endpoint，讓該路徑可接收 Liveblocks 請求；簽章仍由 Backend 強制驗證。不要把 bypass secret 放在公開 URL。
6. 開啟一個測試專案，等「已同步」，擁有者／工作區管理者按右上角「畫布備份」→「立即備份」。確認有一筆時間記錄。
7. 修改節點並等同步，稍候確認 Webhooks 後台交付成功，重新整理備份清單，確認有新增版本。**「立即備份」成功只能證明 R2 寫入；必須另外確認 Webhook 交付，才代表自動備份已生效。**
8. 既有但近期沒有編輯的專案不會自行發出更新通知。重要專案啟用後各按一次「立即備份」，建立第一份獨立備份。

本機／Preview 使用獨立測試 bucket、Liveblocks 專案與 Webhook secret，不共用正式備份。

### 啟用限制與排程

1. 先部署包含專案備份鎖的新 Backend，維持 `CANVAS_BACKUP_RETENTION_ENABLED=false`。等舊部署的請求結束，不再讓舊版 writer 或舊版 webhook endpoint 寫入同一 bucket，才啟用清理。
2. 在 Inngest 建立正式環境的 app；將 **Event key**、**Signing key** 分別填入 Vercel Backend / Production 的 `INNGEST_EVENT_KEY`、`INNGEST_SIGNING_KEY`，皆設為敏感值。不要將 key 貼到對話或 Git。
3. 重新部署 Backend，在 Inngest 同步 `https://你的正式Backend網域/api/inngest`。確認列出 `canvas-backup-flush`、`canvas-backup-cleanup`、`daily-canvas-backup-cleanup` 三個工作。若有 Deployment Protection／WAF，允許 Inngest 存取這個路徑；執行請求仍須通過 SDK 簽章驗證。
4. 移除備份 bucket 上自行設定的版本／附件到期刪除規則，讓程式統一判斷引用。不要對 `canvas-backups/files/` 或整個 bucket 設定到期刪除。
5. Backend 設定 `CANVAS_BACKUP_RETENTION_ENABLED=true`，重新部署，再同步 Inngest app。這時會開始依以下規則清除舊版本，啟用前請確認需要長期保存的歷史已另行保存。
6. 驗收：立即備份兩次且內容未變，第二次應提示沿用最近備份；修改後在 15 分鐘內停手，Inngest 的 flush 工作應等到間隔結束後擷取最後內容，不需要再修改一次。確認每日清理工作執行成功，再選擇保留中的舊版還原成新專案，檢查附件仍可使用。

排程時間為每日 UTC 03:17（台灣 11:17）。Liveblocks 失敗交付與 Inngest 失敗工作應修復後重試。停用保留旗標會停止限制與清理，但基本 Webhook 備份仍會持續新增。Inngest 未設定或排程送出失敗時會回報失敗，避免把漏掉最後一次變更當作成功。

Inngest 只註冊備份與清理工作，不註冊文件索引。更新 Backend 後可在 app 的 **Resync** 同步工作清單；同時啟用原檔清理時，總共應有上述三個工作，以及 `original-project-file-cleanup`、`daily-original-file-cleanup`。不需新增 key。

## 還原

1. 以工作區 owner 或 admin 開啟專案，按「畫布備份」。editor／viewer 不提供備份或還原操作。
2. 選擇備份時間，按「還原」，核對後按「還原為新專案」。
3. 系統在同一工作區新增「原名稱（備份還原）」；從備份複製附件並重新對應網址，保留三區內容、位置、顏色及關係文字。開啟時會將還原快照匯入新 Liveblocks 房間。
4. 核對內容及附件下載，關頁再重開確認。原專案及原房間不會被覆寫，其他人可繼續編輯。

還原前會檢查版本、畫布與清單的 SHA-256 校驗碼、專案／工作區、附件來源路徑。備份損壞或複製失敗會停止，不建立可見的新專案。若檔案已複製但 Neon 提交結果不明，可能留下未引用物件；不自動刪除，以免移除其實已成功提交的檔案。

這個入口還原的是**現存專案的歷史畫布**。專案或工作區已整個刪除時，須由管理者先透過 Neon 備份恢復其資料與權限，再使用原專案 ID 讀取對應備份；一般使用者不能瀏覽已刪除或無權存取專案的備份。此工具也不等於停用 Liveblocks 後的整站遷回工具。

## 保留與容量

- 畫布版本路徑：`canvas-backups/v1/<projectId>/`；附件副本：`canvas-backups/files/<projectId>/<documentId>`。同一附件 ID 只複製一次；各次畫布版本獨立保存。
- 啟用保留旗標後，每個專案保留**最近 50 份，最長 30 天**，先達到的限制生效。頻繁手動備份可能讓歷史不足 30 天。手動與自動版本一起計算；相同內容沿用最近版本，不更新它的保存時間。
- 自動備份間隔至少 15 分鐘；間隔內的修改交給持久排程，在到期後讀取最新雲端畫布。手動「立即備份」可略過間隔，但仍受去重、數量與天數限制。沒有修改不會固定每 15 分鐘新增一份；很久沒有編輯的專案仍會由每日工作清理到期版本。
- 建立／列出備份時會修剪版本；每日工作也掃描不活躍、已刪除與只剩附件副本的專案路徑。每批最多刪除 100 個版本或 100 個附件副本，剩餘工作繼續排隊。每日清理、重試或大量積存可能讓實體物件晚於期限移除；還原只提供保留範圍內的版本。
- 附件副本必須同時不被任何保留版本及現存雲端畫布引用，而且已存在超過 24 小時，才能刪除。共用附件會保留到最後一份引用版本到期。新備份只複製畫布實際引用且完成上傳的檔案；舊備份清單中的附件照樣保護。原上傳 bucket 與還原後新專案的檔案不在清理範圍內。
- 上述是備份副本清理。原始上傳物件另由 `R2_PROJECT_CLEANUP_ENABLED` 控制，只清已刪除專案並使用獨立的 24 小時寬限期；不需關閉畫布備份即可使用，詳見 [原檔清理](03-cloudflare-r2.md#刪除專案後清理原始檔)。還原中的附件與原檔清理共用來源專案鎖；還原後的新專案依自己的 ID 受保護。
- 清理先完整列舉及校驗保留版本，遇到損壞備份、分頁不完整、讀取失敗或無法確認雲端引用時停止附件刪除。跨執行個體以 Neon 專案交易鎖協調備份、還原與清理；讀取清單期間若新增版本，重新規劃後再清理。
- 刪除應用內專案不會立刻清空備份，仍依相同政策到期。50 份是每專案版本數上限，不是整個帳號的容量或費用上限；附件大小、專案數與 API 次數仍影響 R2 用量。
- 單份 Yjs 文件上限 32 MiB，含附件清單的未壓縮備份上限 64 MiB。附件本體沿用每檔 20 MB 上傳限制，跨 bucket 複製，不經 Vercel 回傳給瀏覽器。
- 大量附件首次備份／還原可能超過 Vercel 請求時間；會回報失敗，已複製的備份附件可在重試時沿用。請以符合實際大小的測試專案確認平台限制，失敗時查看服務交付紀錄。

## 測試

```sh
pnpm test:e2e:api
pnpm test
node scripts/test-db.mjs --collaboration-only
pnpm exec playwright test e2e/canvas-backups.spec.ts e2e/collaboration.spec.ts
pnpm test:secrets
```

API 測試使用官方簽章驗證器、真正的 Yjs 文件及隔離的雲端替身，涵蓋簽章／過期請求、權限、還原、內容去重、15 分鐘延後擷取、50 份／30 天限制、共用附件、雲端引用保護、24 小時寬限、清理競爭及失敗時保留附件。單元測試涵蓋持久排程、分批讀取／清理、延續工作及鎖定失敗；隔離 Neon 測試確認獨立連線的互斥與失敗釋放，不修改應用資料表。瀏覽器測試涵蓋失敗重試、政策提示、重複備份不新增、確認步驟、Esc 與焦點回復、跳轉新專案及 viewer 不顯示入口。

自動測試不會讀寫正式 Neon、R2 或 Liveblocks。正式服務的 Webhook 交付、跨 bucket 權限及真實備份還原須在完成上述設定後確認。

參考：[Liveblocks Webhooks](https://liveblocks.io/docs/platform/webhooks)、[Yjs 備份方式](https://liveblocks.io/docs/guides/can-i-use-my-own-database-with-yjs)、[R2 S3 相容性](https://developers.cloudflare.com/r2/api/s3/api/)、[Inngest 延後執行](https://www.inngest.com/docs/durable-execution/primitives/step-sleepuntil)。
