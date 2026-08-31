# Inngest 背景工作

大型檔案解析、chunking、embedding 與重試不能放在 Vercel 短生命週期 request 內。API 只負責驗證與排程，Inngest 執行耐久工作。

## 本機

先啟動 backend，再開另一個終端機：

```powershell
pnpm dev:inngest
```

開啟 Inngest Dev Server 顯示的網址；serve endpoint 為 `http://localhost:3001/api/inngest`。

## 正式環境

1. 在 Inngest 建立 app，Sync URL 填 `https://你的-backend/api/inngest`。
2. 取得 Event Key 與 Signing Key。
3. 放到 backend Vercel variables：

```dotenv
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

目前 `document-indexing-placeholder` 只驗證 event。下一階段應拆成：確認 document → 從 R2 讀取 → 解析 → chunk → 使用該文件擁有者的 Gemini credential embedding → 寫入索引 → 更新狀態。每一步要可重試且以 document id 做冪等。
