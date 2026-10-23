# Gemini BYOK

每位使用者在「AI Key」設定自己的 Gemini API Key。Backend 驗證後用 AES-256-GCM 加密保存，只回傳遮罩提示，不設共用前端 Key。

## 管理者設定

- `USER_API_KEY_ENCRYPTION_KEY`：base64 編碼的 32-byte key，只放 backend。本機與正式庫使用既有資料時必須沿用原值。
- `GEMINI_MODEL`：使用目前帳號可用的模型名稱；程式與示範環境檔預設 `gemini-2.5-flash`，不代表其他帳號皆有相同配額或模型權限。
- 第一次建立空白環境才產生加密 key：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

加密金鑰尚無自動輪替工具；更換前須規劃並驗證既有資料的重加密流程。

## 使用者流程

1. 從 Google AI Studio 取得自己的有效 Key。
2. 登入 → AI Key → 貼上 →「驗證並儲存」。
3. Backend 會發出最小 Gemini 測試請求，可能使用配額；成功後只顯示遮罩。
4. 更換失敗不覆蓋原設定，可在介面刪除 Key。

資料架構、對話與收斂使用該登入使用者的 Key。收斂主要根據發散節點完整內容、關係與重要標記；資料架構作背景，結果仍需人工核對。不做 RAG、Embedding 或自動文件檢索。

額度、權限、模型與上游故障會轉成錯誤訊息。自動測試使用 SDK 替身，真實配額與生成品質需另行驗收。日誌不得記錄完整 Key、私有 prompt、回覆或含憑證的 SDK 診斷。
