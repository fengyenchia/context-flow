# Backend 平台防護

透過 Vercel Firewall 限制驗證入口流量，搭配應用程式的登入與角色授權。

## 已有保護與邊界

程式已有 JWT／session、Email 驗證、角色授權、scrypt、AI Key 加密、私人檔案授權與畫布版本檢查。`backend/server/rate-limit.ts` 對 login、register、forgot-password、reset-password、resend-verification，以及專案邀請的 preview／accept，分別以 IP／路徑做每程序 30 次／15 分鐘限制；程序重啟或不同實例不共用計數。

平台層補上跨實例流量限制，不取代程式授權。Vercel 計數按 region，不能宣稱為全球唯一計數器。

## 瀏覽器設定

1. 開啟 **context-flow-backend → Firewall → Configure → New Rule**。不要在 Frontend 設定這條 API 規則。
2. 核對目前方案支援的規則與費用。
3. 規則名稱可用 `auth-entrypoints`，以下三項以 **AND** 組合：

| 條件 | 值 |
| --- | --- |
| Environment | Production（若介面可選） |
| Method / Equals | POST |
| Request Path / Is any of | 下方六個完整路徑 |

```text
/api/auth/login
/api/auth/register
/api/auth/forgot-password
/api/auth/reset-password
/api/auth/resend-verification
/api/auth/check-username
```

使用 Request Path，不是 framework Route 的 `/api/[...path]`。不要把六個路徑各用 AND 接起來；Is any of 等於其中任一匹配。

4. **Then → Rate Limit**，設定 **Fixed Window、60 秒、60 requests、Counting Key = IP**。這是起始建議，不是通用最佳值；六條路徑共享 IP 額度，校園／公司 NAT 要觀察誤傷。
5. 初期超限動作選 **Log**（只記錄不阻擋），確認設定後選 **Save Rule → Review Changes → Publish**。
6. 觀察正常登入、忘記密碼與驗證流程，再將超限動作改成 **Default 429**。保留退回 Log 或停用規則的方式。

可將六個入口合併為一條規則；可用規則數與計費依平台方案為準。

## 不要誤封正常流量

- 不把整個 `/api/*` 套入同一個低門檻，避免自動儲存、AI、檔案與 refresh 被封。
- 此規則不匹配 GET／OPTIONS、health、Email 驗證 GET、refresh 或 logout。
- 不對 API 使用互動式 Challenge／Redirect，避免 fetch 收到 HTML 而非 API 回覆。
- 不以單獨檢查 Origin／Referer 取代 JWT；CORS 不是使用者授權。
- Backend 正式 API 應可供一般訪客使用，不要以「必須登入 Vercel」保護所有流量；Preview 可另保護，但不要把 bypass secret 放到前端。

## 驗證與回退

先記錄規則截圖與修改時間，用正常的小量操作確認登入／重整／上傳／畫布保存仍正常，在 Firewall 檢查對應規則與事件。不要對正式站大量寄信、撞密碼或發生費用來證明限流有效；受控超限測試另用隔離環境／時段。

啟用 429 後若發生誤傷、CORS 或 `Failed to fetch`，先看被擋路徑與平台回覆，必要時退回 Log，保留事件證據再調整。平台產生的阻擋回覆不一定具有應用程式的 CORS／JSON 格式，不先假設是程式儲存錯誤。

## 同時確認

- R2 bucket 非公開，token 僅有需要 bucket 的 Object Read & Write；CORS 只保留需要的精確 origin。
- Production secrets 不套用到 Preview；不把 TEST_DATABASE_URL 放平台、不更換原本 production URL／加密 key。
- 設定可用的錯誤／用量通知與費用控制；確認備份保留及還原步驟，不因設定 WAF 重跑 migration。
- 通知開關、實際收信、Preview 資源及舊 R2 token 分別核對，見[維運指南](19-operations.md)。沒有測試收信或工作失敗告警時，不記成已完成。
- 只分享遮罩後的設定畫面與事件路徑，不分享 cookie、Authorization、HAR、預簽網址或私有檔案內容。
- Inngest 的 `/api/inngest` 需可接收平台簽章請求，不套互動式 Challenge。畫布備份、備份副本清理及原始檔清理各依旗標控制；Neon 還原／搬檔前先暫停原檔清理並等執行中的批次結束。原上傳 bucket 不設繞過引用核對的到期規則。

## 來源

- [Vercel WAF Rate Limiting：設定、方案、region 計數](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Rule Configuration：Request Path、Method、Is any of、AND／OR](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration)
- [Custom Rules：動作與平台設定](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules)
