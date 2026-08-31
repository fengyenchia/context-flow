# 本機安裝與專案開啟流程

## 1. 確認工具

```powershell
node --version
pnpm --version
```

建議 Node.js 24 以上、pnpm 11 以上。若電腦尚未安裝 pnpm，可在已有 Node.js 的情況下執行 `corepack enable` 與 `corepack prepare pnpm@11.19.0 --activate`。

## 2. 安裝依賴

在 `C:\webProjects\context-flow` 執行：

```powershell
pnpm install
```

這是 pnpm workspace；不要分別在 `frontend`、`backend` 使用 npm 安裝。

## 3. 建立環境檔

```powershell
Copy-Item backend\.env.example backend\.env.local
Copy-Item frontend\.env.example frontend\.env.local
```

本機先保留：

```dotenv
# backend/.env.local
FRONTEND_URL=http://localhost:3000
PUBLIC_APP_URL=http://localhost:3000
DATA_MODE=memory

# frontend/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
```

Memory mode 不需要資料庫；每次重開 backend，帳號與專案資料都會清空。

註冊驗證與忘記密碼信件使用 Resend。未填 `RESEND_API_KEY`、`EMAIL_FROM` 時，開發環境會把驗證／重設連結記錄在 backend console，不會真的寄信；要寄出信件時，請填入 Resend API Key 與已驗證寄件網域。

若要測 AI Key 儲存，產生 32-byte AES key：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

把輸出放到 `backend/.env.local` 的 `USER_API_KEY_ENCRYPTION_KEY=` 後面。

## 4. 啟動

```powershell
pnpm dev
```

終端機會同時顯示 frontend（3000）與 Next.js backend（3001）log。瀏覽器開啟 <http://localhost:3000>，點「建立帳號」即可註冊；註冊需要 Email，驗證信會由 Resend 寄出（未設定 Resend 時只記錄開發連結）。

## 5. 第一次操作建議

1. 建立一般帳號並登入。
2. 在自動建立的個人工作區新增專案。
3. 建立共享工作區。
4. 再註冊第二個帳號；回到第一個帳號，用第二個帳號的 username 發邀請。
5. 到「AI Key」設定 Gemini API Key。
6. 到「密碼與安全性」按「寄送 Email 驗證連結」即可透過 Email 重設密碼。
7. 進入專案畫布，在「資料池」加入文字、連結、圖片或檔案；按「整理成 Data Zone」建立來源可追溯的核心架構節點。

## 專案畫布操作

寬螢幕時畫布是三個橫向工作區：資料池、Data Zone、洞察區；窄螢幕時會改為直向堆疊。每一區標題列的收合按鈕都能單獨收起，讓其餘區域取得更多視野。

- 文字與連結會直接送入 Data Zone 的 Gemini 整理請求。
- 圖片與檔案現階段會保留名稱與可讀摘要；實際上傳、R2 儲存及大型檔案解析屬於後續 Inngest 背景工作管線。
- Data Zone 使用該登入使用者的 BYOK Gemini Key，未設定 Key 時會提示先到「AI Key」設定。

## 6. 檢查

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

API 健康狀態是 <http://localhost:3001/api/health>。

## 常見問題

- 前端顯示無法連線：確認 backend 在 3001 port，且 `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api`。
- 表單顯示「尚未登入」：檢查 `frontend/.env.local` 是否誤設為 `/api/v1`；此專案 API base 必須是 `http://localhost:3001/api`。改完後重啟 `pnpm dev`。
- Cookie 沒有送出：本機前後端都應使用 `http://localhost`；不要混用 `127.0.0.1`。
- AI Key 儲存失敗：確認 AES key 是 base64 編碼的完整 32 bytes，且 Gemini Key 可用。
- 重開後資料消失：這是 `DATA_MODE=memory` 的預期行為。
