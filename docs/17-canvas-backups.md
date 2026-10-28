# 畫布備份與還原

## 保存方式

Liveblocks 仍是共編畫布的主要資料來源。收到已簽章的 `ydocUpdated` Webhook 後，Backend 讀取最新 Yjs 文件，將完整文件、專案資料和附件清單壓縮保存到獨立的私人 R2 bucket。附件另存一份，不依賴原上傳物件。這不會把舊版快照寫回正在使用的畫布。

涵蓋資料池、資料架構／發散／收斂節點、底色、位置、連線及文字、對話、總結與已完成上傳的附件。外部網址的內容不會下載備份；外部圖片失效仍需補圖。帳號、工作區與成員權限仍須由 Neon 備份保護。

Webhook 通知有節流，因此不是每次按鍵都會產生一份備份，也不是「已同步」就已另存備份。預設通知頻率依 Liveblocks 方案；目前官方文件說明一般為最多每 60 秒通知一次。失敗回覆 503，讓 Liveblocks 重試；重送同一通知不會覆蓋已完成的版本。超過平台重試期限仍失敗時，需要管理者在 Webhooks 後台查看失敗記錄、修復後重送。

## 服務設定

不需要 migration、不新增 Frontend 變數、不需 Inngest 或額外排程。`DATABASE_URL` 保持原本 production 連線。

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

## 還原

1. 以工作區 owner 或 admin 開啟專案，按「畫布備份」。editor／viewer 不提供備份或還原操作。
2. 選擇備份時間，按「還原」，核對後按「還原為新專案」。
3. 系統在同一工作區新增「原名稱（備份還原）」；從備份複製附件並重新對應網址，保留三區內容、位置、顏色及關係文字。開啟時會將還原快照匯入新 Liveblocks 房間。
4. 核對內容及附件下載，關頁再重開確認。原專案及原房間不會被覆寫，其他人可繼續編輯。

還原前會檢查版本、畫布與清單的 SHA-256 校驗碼、專案／工作區、附件來源路徑。備份損壞或複製失敗會停止，不建立可見的新專案。若檔案已複製但 Neon 提交結果不明，可能留下未引用物件；不自動刪除，以免移除其實已成功提交的檔案。

這個入口還原的是**現存專案的歷史畫布**。專案或工作區已整個刪除時，須由管理者先透過 Neon 備份恢復其資料與權限，再使用原專案 ID 讀取對應備份；一般使用者不能瀏覽已刪除或無權存取專案的備份。此工具也不等於停用 Liveblocks 後的整站遷回工具。

## 保留與容量

- 畫布版本路徑：`canvas-backups/v1/<projectId>/`；附件副本：`canvas-backups/files/<projectId>/<documentId>`。同一附件 ID 只複製一次；各次畫布版本獨立保存。
- 預設不自動刪除歷史。可對 **`canvas-backups/v1/`** 設 R2 lifecycle，例如保留 30 天；不要將相同期限套到 `canvas-backups/files/`，否則較新快照仍引用的附件可能提早消失。附件清理需先確認沒有保留中的版本引用。
- 刪除應用內專案不會立刻刪除備份。備份含使用者內容，管理者需依資料保留政策處理容量、過期與刪除要求。R2 私人備份仍會產生儲存及 API 操作費用。
- 單份 Yjs 文件上限 32 MiB，含附件清單的未壓縮備份上限 64 MiB。附件本體沿用每檔 20 MB 上傳限制，跨 bucket 複製，不經 Vercel 回傳給瀏覽器。
- 大量附件首次備份／還原可能超過 Vercel 請求時間；會回報失敗，已複製的備份附件可在重試時沿用。請以符合實際大小的測試專案確認平台限制，失敗時查看服務交付紀錄。

## 測試

```sh
pnpm test:e2e:api
pnpm exec playwright test e2e/canvas-backups.spec.ts e2e/collaboration.spec.ts
pnpm test:secrets
```

API 測試使用官方簽章驗證器、真正的 Yjs 文件及隔離的雲端替身，涵蓋簽章／過期請求、重複事件、服務失敗重試、權限、不同專案隔離、分頁、損壞資料、三區與附件還原、原畫布保留及資料庫失敗回滾。瀏覽器測試涵蓋清單／立即備份／還原失敗重試、確認步驟、Esc 與焦點回復、跳轉新專案及 viewer 不顯示入口。

自動測試不會讀寫正式 Neon、R2 或 Liveblocks。正式服務的 Webhook 交付、跨 bucket 權限及真實備份還原須在完成上述設定後確認。

參考：[Liveblocks Webhooks](https://liveblocks.io/docs/platform/webhooks)、[Yjs 備份方式](https://liveblocks.io/docs/guides/can-i-use-my-own-database-with-yjs)、[R2 S3 相容性](https://developers.cloudflare.com/r2/api/s3/api/)。
