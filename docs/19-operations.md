# 維運、通知與環境隔離

這份文件供部署與服務管理者使用。一般畫布操作見[使用手冊](https://context-flow.fengyenchia.com/guide)。

## 費用邊界

維持免費方案，不為了通知、監控或 Preview 升級，不新增付費附加功能。若某項功能只在付費方案提供，記為未啟用，不以升級完成驗收。

R2 的免費額度不等於零費用保證；容量或操作量超出免費額度仍可能計費。預算警示只通知，不是支出硬上限。若不能接受任何超額計費風險，必須另行停用或替換 R2 檔案／備份服務，不能靠把警示門檻改小達成；停用前先處理已上傳檔案與仍需保存的備份。其他服務也以帳號實際方案及當期限制為準，不自動開啟按量付費。

## 通知與收信

設定通知與確認實際收信是兩件事。平台顯示開啟後，仍須以測試通知或下一次真實事件核對收件匣／垃圾郵件；不要故意破壞正式部署、備份或製造大量用量。

| 服務 | 確認位置與範圍 |
| --- | --- |
| Vercel | Team Settings → My Notifications，確認 Email、Deployment Failures 開啟，專案未被靜音。收件人使用該帳號已驗證的主要信箱；用量通知及可自訂門檻依方案而定。部署失敗通知不等於所有 API 錯誤告警。 |
| Liveblocks | 確認帳號收件信箱及方案用量；另在正式專案 Webhooks 檢查失敗交付。用量通知不代表備份 Webhook 一定成功。 |
| Cloudflare R2 | Account → Notifications，依帳號可用項目設定用量／費用通知，並在 R2 查看容量及操作次數。通知不是費用硬上限，也不會自動停止備份。R2 物件事件通知是給 Queue 的工作觸發，不能當作管理者收信通知。 |
| Inngest | Production → Runs 檢查 Failed 工作。用量資訊與失敗工作分開確認；若帳號沒有失敗郵件選項，不能把註冊信箱視為已啟用工作失敗告警。自訂告警可監聽 `inngest/function.failed`，但須另行設定、測試寄送與避免告警自身失敗循環。 |

修復失敗交付／工作後再重試，確認 Completed 及實際結果。不要只看 `/api/health` 或「已同步」判定備份成功。寄信失敗、付費方案限制或尚未做收信測試，皆應列為未確認，不記成已完成。

## Production 與 Preview

Production 繼續使用原本資料庫、加密金鑰與服務資源。檢查環境隔離時，不更換 production `DATABASE_URL`，不將備份分支當成正式連線。

1. 在 Vercel 前後端專案的 Environment Variables 分別選 **Preview**；同時檢查 Project 與 Shared 變數、特定 branch 覆寫。
2. 正式資料庫、JWT、加密金鑰、寄信、R2、Liveblocks、Inngest 變數只套用 Production。Frontend 的正式 `NEXT_PUBLIC_API_BASE_URL` 也不能套用 Preview，否則會透過正式 API 操作正式資料。
3. 尚未準備測試資源時，Preview 維持停用／不部署。沒有 Preview 變數代表尚未配置可用的 Preview，不能宣稱已完成一套測試環境。
4. 需要 Preview 時，使用下表的獨立資源；先設好變數，再建立新的 Preview deployment。移除變數不會改寫先前 deployment 已取得的設定，仍須檢查既有部署及可存取網址。

Frontend 在 `VERCEL_ENV=preview` 時會檢查 API 設定；缺少網址、使用已知正式 API、localhost、非 HTTPS 或非 `/api` 路徑時會停止建置，不產生誤連正式站的新版 Preview。這項檢查不會自動建立測試資源，也無法證明任意自訂 API 網域背後的資料庫已隔離，仍須逐項核對。

修改變數範圍時保留原本的 Production 值。平台若要求 Email 驗證，先在平台完成驗證；不要把驗證碼貼到紀錄或對話。只取消 Preview 的勾選，不刪除整筆正式變數。

| 項目 | Preview 要求 |
| --- | --- |
| Frontend／Backend | 一對專用 HTTPS 網域，Frontend 只連 Preview API；Backend CORS、郵件連結與 refresh cookie 需搭配驗證。 |
| Neon | 另外建立可丟棄分支並套用需要的 migration。不要把本機自動測試的 `TEST_DATABASE_URL` 填入 Vercel。 |
| 登入與 Gemini Key 保存 | 另外產生 JWT secrets 與加密 key；不沿用正式帳號、session 或已加密資料。 |
| R2 | 獨立上傳／備份 bucket 與限定這些 bucket 的 token；CORS 只允許測試來源。 |
| Liveblocks | 獨立 project、secret 與 Webhook endpoint；不共用正式房間。 |
| Inngest | 專用測試 environment、keys 與 app 同步位置；原檔清理先關閉，不向正式環境註冊測試排程。 |
| 郵件與 AI | 測試收件人／測試帳號及自己的 Gemini Key；不對正式使用者寄測試信。 |

本機也受相同原則約束。若刻意從本機查看已啟用共編的正式專案，共編旗標必須與正式站一致；關閉旗標不會隔離資源，只會改讀舊快照。日常開發應使用隔離入口及資源。

## 舊 R2 憑證撤銷

1. 先核對目前 Backend Production 與本機使用中的 **Access Key ID**；比較時只記遮罩或指紋，不輸出 Secret Access Key、完整環境檔或連線字串。
2. 在 Cloudflare R2 的 API token 清單核對名稱、權限、bucket 範圍及 Access Key ID。不要只憑名稱相似、建立時間或「舊」字判斷。
3. 檢查是否仍有其他專案、Preview、舊部署、排程或本機使用該 token。平台沒有提供完整使用紀錄時，不能把「沒看到請求」當成無人使用的證據。
4. 使用新憑證的 Backend 部署 Ready 後，確認原檔上傳／下載、立即備份、自動備份及附件還原正常，才撤銷已確認不用的舊 token。不要撤銷使用中的 token，也不要刪 bucket 或物件來測試。
5. 撤銷後再確認正式功能與排程正常。若出現 403，修正引用舊憑證的部署；不要把新憑證貼到對話或紀錄。

通知、token 名稱與帳號設定可能因平台方案／介面改變而不同。只記錄已核對的結果；正式測試紀錄及個資不放公開 repository。

參考：[Vercel 通知](https://vercel.com/docs/notifications)、[環境變數](https://vercel.com/docs/environment-variables)、[Liveblocks 用量通知](https://liveblocks.io/docs/pricing/faqs)、[R2 指標](https://developers.cloudflare.com/r2/platform/metrics-analytics/)、[Inngest 失敗事件](https://www.inngest.com/docs/reference/system-events/inngest-function-failed)。
