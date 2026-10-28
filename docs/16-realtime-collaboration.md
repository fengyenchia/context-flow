# 即時共編

## 架構與資料位置

- WebSocket 連線與 Yjs 文件由 Liveblocks 保存；Vercel 只負責驗證登入及房間授權，不維持常駐 WebSocket。
- Neon 繼續保存帳號、工作區、成員、專案及啟用前的畫布快照；R2 原始檔案位置不變。
- 啟用後，畫布的最新內容以 Liveblocks 的 Yjs 文件為準，**Neon 舊快照不是啟用後的備份**。資料池內容、對話和三區畫布也會保存到這個服務；需確認資料政策適合使用情境。
- 可另啟用 [畫布自動備份與還原](17-canvas-backups.md)，透過已簽章 Webhook 將歷史版本與附件副本保存到私人 R2；還原成新專案，不覆蓋使用中的房間。
- 第一次開啟專案時由 Backend 匯入原快照；固定的匯入操作 ID 可避免兩人同時首次開啟造成重複內容。之後只讀取共編文件，不反覆套用舊快照。
- 節點以 ID、欄位分開合併，文字使用 Y.Text；正在編輯的視窗保留自己的基底，儲存時不會把未修改的舊欄位蓋回去。相同非文字欄位（例如同時選不同底色、拖曳同一節點）仍只能有一個結果，Yjs 會決定一致結果；不代表同時保留兩個位置或自動理解文字語意。
- 刪除節點優先於對已刪除節點的連線；選取、視角、測量值不共用。這版不提供遠端游標或文字輸入中的逐字顯示；節點對話框按儲存後即同步。

## 設定

1. 在 [Liveblocks](https://liveblocks.io/dashboard) 建立專案。正式與開發／Preview 使用不同專案，不共用房間資料。
2. 複製該專案的 Secret key，只填入 Vercel **Backend** 的 `LIVEBLOCKS_SECRET_KEY`。不要填到 Frontend、不加 `NEXT_PUBLIC_`、不貼到對話或提交 Git。
3. 先部署新版 Frontend，確認舊版使用中的分頁會重新整理。Backend 未啟用時仍使用原本版本保護儲存。
4. 完成既有 Neon 備份，安排短暫停止編輯，等所有分頁「已儲存」後關閉。Backend 設定 `COLLABORATION_ENABLED=true`，重新部署，並使用新版 Frontend。
5. 使用者在共編文件首次載入完成前不能編輯。右上角應顯示「已同步 · N 人在線」；N 是連線數，同帳號不同分頁也會分別計數。
6. 不需設定 Liveblocks public key、不需新增 Frontend 變數、不需新增 Neon migration；`DATABASE_URL` 維持原本連線。

若你在 Vercel 使用 Root Directory，前後端都必須開啟「Include source files outside Root Directory」，讓 `packages/collaboration` 參與建置。

**啟用後不能直接把 `COLLABORATION_ENABLED` 關掉或改用另一組 Liveblocks 專案密鑰**：這會回到舊的 Neon 快照或另一套空房間。回退前必須停止編輯、匯出並遷回最新 Yjs 文件；目前沒有自動遷回工具。啟用但密鑰缺失／服務失效時會報錯，不會默默用舊快照覆蓋。

## 權限與斷線

- 房間預設為私人。Backend 用現有登入憑證確認工作區成員，再簽發 ID token；不接收客戶端指定的角色、user ID 或任意房間 ID。
- owner／admin／editor 可寫，viewer 僅讀；變更角色、移除成員或停權時同步更新房間 ACL，避免只在前端隱藏按鈕。
- 授權與成員異動以 Neon advisory lock 跨 Vercel 實例排序，防止較早開始的授權把已撤銷權限加回去。先撤銷、資料庫成功後才授權；鎖連線在單一請求內開啟並關閉，不需要 migration 或更換 `DATABASE_URL`。Backend 必須允許連到 Neon 的 WebSocket（Node 24 內建支援）。
- 分享專案網址不會授權非成員。單一專案邀請連結尚未提供。
- 重連會重新交換 Yjs 更新並合併。離線後修改暫存在此分頁記憶體；**沒有離線重整復原能力**，重連且顯示「已同步」前勿關頁、登出或重新整理。關頁會有未同步警告。
- 「已同步」表示 provider 已確認本地與遠端文件一致，不等於每次修改都另寫入 Neon。服務的儲存、配額及備份政策需在 Liveblocks 專案確認。

## 測試與正式驗收

```sh
pnpm --filter @context-flow/frontend test
pnpm test:e2e:api
pnpm exec playwright test e2e/collaboration.spec.ts
node scripts/test-db.mjs --collaboration-only
```

- 單元測試使用兩份真正的 Yjs 文件，檢查欄位／文字／訊息合併、刪除、重複傳送、舊快照匯入與還原。
- Backend API 測試 mock Liveblocks，檢查授權、viewer、移除／降權、舊版 PUT 拒絕及未設定服務時的拒絕策略。
- `--collaboration-only` 使用既有隔離檢查及 `TEST_DATABASE_URL`，只在兩條 Neon 連線取得／釋放 advisory lock；不執行 migration，不修改資料表或帳號，原本 production `DATABASE_URL` 不變。
- 瀏覽器測試使用不同登入身分與獨立 context，透過本機 WebSocket fixture 執行實際畫布操作、斷線重連及重載。隔離開發伺服器才會替換雲端傳輸，正式 build 固定使用官方 provider。這些測試不驗證真實 Liveblocks 的憑證、ACL 即時生效、配額或雲端持久化。

設定服務後，仍需以正式／隔離 Liveblocks 專案驗收：兩個不同帳號同開一個專案、同改不同節點、同開一節點視窗分別前後加字、斷線後重連、所有人關頁再重開、viewer 嘗試編輯、將正在連線的 editor 改成 viewer／移除並確認不能再寫入。先使用可刪除的測試專案，不使用真實敏感內容。

參考：[Yjs provider](https://liveblocks.io/docs/api-reference/liveblocks-yjs)、[Backend 與 ID token](https://liveblocks.io/docs/api-reference/liveblocks-node)。
