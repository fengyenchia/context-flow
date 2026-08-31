# Liveblocks 多人共編設定

Vercel Function 不適合自行維持 WebSocket server，因此專案採 Liveblocks 管理即時房間。Backend 根據 workspace membership 發行 room session，viewer 只有讀取權，其餘角色可寫入。

## 設定

1. 在 Liveblocks Dashboard 建立 project。
2. 建立 Secret key，僅放 backend：

```dotenv
LIVEBLOCKS_SECRET_KEY=sk_...
LIVEBLOCKS_WEBHOOK_SECRET=whsec_...
```

3. 正式 webhook URL 預留為 `https://你的-backend/api/liveblocks/webhook`。

## 目前狀態

Backend 應以 `/api/collaboration/authorize` 做 membership 授權；frontend 目前先以 React Flow 本機 state 呈現畫布，尚未把 nodes/edges 接到 Liveblocks storage。完成接線時應：

- 以 `project:{projectId}` 當 room id。
- 先向 Next.js backend authorize endpoint 取得 session，而非把 secret 放 frontend。
- 將 nodes、edges、presence/cursor 分開；大量文件內容不要放 presence。
- viewer 關閉 drag、connect 與 mutation。
- webhook 驗證簽章後再做 audit 或 snapshot。
