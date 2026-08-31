# Cloudflare R2 設定

## 建立 Bucket 與 API Token

1. 進入 Cloudflare Dashboard → R2 Object Storage。
2. 建立 bucket，例如 `context-flow-production`。
3. 進入 Manage R2 API Tokens，建立只限此 bucket 的 Object Read & Write token。
4. 記下 Account ID、Access Key ID、Secret Access Key；Secret 通常只顯示一次。

放入 `backend/.env.local`：

```dotenv
R2_ACCOUNT_ID=
R2_BUCKET_NAME=context-flow-production
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

## CORS

Bucket 的 CORS 至少允許正式前端網域與本機：

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://你的前端網域"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Frontend 先向 backend 取得 10 分鐘預簽 PUT URL，再直接上傳 R2；R2 secret 不會出現在瀏覽器。正式完成文件功能時，還要在上傳後寫入 `documents` 並送出 Inngest `contextflow/document.uploaded` event。

建議 production bucket 預設不公開，下載也透過短效預簽 URL。
