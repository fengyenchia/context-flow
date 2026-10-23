# Cloudflare R2 檔案保存

原始檔案保存於私人 bucket，透過預簽網址上傳與下載。

## 平台設定

在 Cloudflare Dashboard → R2 建立私人 bucket，建立只限該 bucket 的 Object Read & Write token。將值放入 backend/.env.local 或 Vercel Backend：

```dotenv
R2_ACCOUNT_ID=
R2_BUCKET_NAME=context-flow-production
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Bucket CORS 範例（將正式網域換成你的前端）：

`AllowedOrigins` 必須包含前端的完整 origin，不加路徑或結尾 `/`。若 API 預簽成功但 R2 PUT 出現 `Failed to fetch`，先檢查 CORS 預檢，再檢查憑證與網路；不要公開 bucket 來繞過問題。

```json
[{
  "AllowedOrigins": ["http://localhost:3000", "http://127.0.0.1:3000", "https://context-flow.fengyenchia.com"],
  "AllowedMethods": ["PUT", "GET", "HEAD"],
  "AllowedHeaders": ["Content-Type"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

## 上傳與下載流程

1. POST /api/projects/:projectId/files/upload：檢查 workspace 寫入權限、非空白及 20 MB 限制，保留 pending 檔案紀錄，回傳 10 分鐘有效的預簽 PUT URL。
2. 前端直接 PUT 原始檔案到 R2，秘密不會進入瀏覽器。
3. POST /api/files/:id/complete：後端用 HEAD 檢查實際大小，才將紀錄設為 ready。
4. 資料池保存 r2://檔案ID，而不是會過期的預簽 URL。
5. GET /api/files/:id/download：再次檢查 workspace 權限，回傳 3 分鐘有效的私人下載 URL。

未完整上傳的檔案不開放下載。程式不解析 PDF、不切片、不送出 RAG/Inngest 工作。刪除專案只移除資料庫的檔案紀錄，R2 原始物件仍保留；若需清理孤立物件，應先核對引用，再另行設定清理規則。
