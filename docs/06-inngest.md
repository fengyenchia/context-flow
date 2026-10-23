# Inngest 背景工作

（暫緩）大型檔案解析、chunking、embedding 與重試目前不在產品範圍內。本文件保留為未來若重新啟動文件索引需求時的架構備忘，不代表目前需要設定 Inngest。

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

目前 `document-indexing-placeholder` 只驗證 event；文件解析、chunk、Embedding、索引與重試流程均暫不實作。
