# Gemini BYOK 設定

ContextFlow 不使用共用 Gemini Key。每位使用者登入後到「AI Key」頁貼上自己的 Key；backend 驗證後以 AES-256-GCM 加密。

帳號註冊需要 Email；驗證與忘記密碼使用 server-only 的 Resend 設定（`RESEND_API_KEY`、`EMAIL_FROM`）。

## 系統管理者設定

先產生 base64 32-byte encryption key：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

放入 `backend/.env.local` 與 Vercel backend variables：

```dotenv
USER_API_KEY_ENCRYPTION_KEY=產生的值
USER_API_KEY_ENCRYPTION_KEY_VERSION=1
GEMINI_MODEL=gemini-3.6-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
GEMINI_EMBEDDING_DIMENSIONS=768
```

## 使用者操作

1. 自行從 Google AI Studio 建立 Gemini API Key。
2. 登入 ContextFlow → AI Key。
3. 貼上 Key，按「驗證並儲存」。
4. 成功後畫面只顯示遮罩提示，永遠不回傳完整 Key。

Data Zone 也使用同一把使用者 Key。當資料池中的資料送出後，後端會要求 Gemini 3.6 Flash 回傳 JSON 格式的核心節點、節點關聯與來源 ID；前端才將其顯示在畫布上。這讓每一個 AI 整理結果都能回連到輸入資料，而不是沒有根據的摘要。

更換 server encryption key 時不能直接覆蓋：先保留舊版本解密能力，批次重新加密，再提高 `USER_API_KEY_ENCRYPTION_KEY_VERSION`。金鑰、明文 request 與 AI 回覆不應寫入一般 application log。
