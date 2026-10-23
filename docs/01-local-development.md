# 本機開發

## 工具與安裝

使用 Node.js 24.x、pnpm 11.19.0，在 repository 根目錄執行：

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
if (!(Test-Path backend/.env.local)) { Copy-Item backend/.env.example backend/.env.local }
if (!(Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
```

不覆寫現有環境檔，不混用 npm 與 pnpm。套件管理器版本由 package.json 釘選。

## 模式與環境變數

前端 `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api`；後端 `FRONTEND_URL` 與 `PUBLIC_APP_URL` 使用 `http://localhost:3000`。不要混用 localhost 和 127.0.0.1。

- 未設定 `DATABASE_URL`：使用記憶體，重啟後資料清空。
- 有設定 `DATABASE_URL`：使用該 Neon 連線；`DATA_MODE=memory` 不是覆蓋連線的隔離開關。
- 自動化測試使用 [隔離測試入口](10-e2e-testing.md)，避免寫入正式資料庫。
- 未設定 Resend 時，開發模式把驗證／重設連結印在 backend console；註冊仍須完成驗證。
- R2 未設定時不能上傳原始檔，文字／連結與一般節點不依賴 R2。
- AI 需要 base64 32-byte 的 `USER_API_KEY_ENCRYPTION_KEY`；已有資料時沿用原值，使用者 Key 在介面設定，見 [Gemini](04-gemini-api-key.md)。

環境變數範本見 `backend/.env.example`、`frontend/.env.example`。

## 啟動與操作

```powershell
pnpm dev
```

前端 [localhost:3000](http://localhost:3000)，API [健康檢查](http://localhost:3001/api/health)。

1. 註冊、完成 Email 驗證並登入。
2. 在個人工作區新增專案；共享工作區另邀請已註冊帳號，對方接受後加入。
3. 資料池加入文字、連結或檔案；按「建立資料架構」產生節點。
4. 畫布為資料池加上資料架構區、發散思考區、收斂總結區；各區可收合，窄螢幕改直向。
5. 雙擊節點修改內容與底色，雙擊連線修改文字。儲存後重載確認。
6. 設定 AI Key 後可對話轉節點、依發散內容「整理成結論」。
7. 展開三區再匯出 PNG／PDF；PNG 為分片 ZIP。檔案已接 R2 上傳／下載，但不解析 PDF、不做 RAG。

## 檢查與疑難排解

```powershell
pnpm check:env
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- 連不到 API：確認 backend 在 3001、base URL 結尾為 `/api`，不是 `/api/v1`；修改公開變數後重啟 frontend。
- 註冊後不能登入：先打開 Email 或開發終端機的驗證連結。
- 檔案上傳失敗：確認是 API 或 R2 PUT 失敗，檢查 [R2 CORS](03-cloudflare-r2.md)，不要分享預簽網址。
- Neon、瀏覽器測試與測試產物位置見 [測試指南](10-e2e-testing.md)。
