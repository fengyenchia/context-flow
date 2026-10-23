# Liveblocks 即時共編（尚未接入）

目前共享工作區已實作成員、角色、共同讀取、保存及更新衝突保護，尚未將 React Flow 的節點、連線、Presence 或游標接到 Liveblocks。現行 Next.js API 也沒有可直接使用的 Liveblocks 授權流程，舊骨架不代表已完成。

因此只設定 Liveblocks 金鑰，不會讓畫布自動即時同步。目前應輪流編輯；若兩個分頁保存不同版本，後寫者會收到 409，先匯出 JSON 備份後重載。

若未來納入即時多人共編，需另行完成以下程式與測試：

- 後端依 workspace membership 授權 project 房間；viewer 為唯讀。
- 節點與連線採可合併的共享資料結構，不能用整份快照互相覆寫。
- 處理離線、重連、移除成員後的權限與 durable snapshot。
- 兩個獨立登入瀏覽器的併發編輯與刪除測試。

參考 [Liveblocks client API](https://liveblocks.io/docs/api-reference/liveblocks-client) 與 [授權權限](https://liveblocks.io/docs/api-reference/authentication/permissions)。在程式接入前，不將 Liveblocks 設定列為目前版本的部署必做項。
