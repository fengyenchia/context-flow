<img src="./frontend/public/brand/context-flow-logo.png" alt="ContextFlow logo" width="64" height="64">

# ContextFlow

以節點畫布整理專案資料、討論與決策的工作台。支援個人／共享工作區，使用者可用自己的 Gemini API Key 協助整理資料、發散與收斂。

[正式網站](https://context-flow.fengyenchia.com) · [文件索引](docs/README.md) · [部署](docs/08-vercel-deployment.md) · [驗收項目](docs/12-acceptance-report.md)

## 功能與範圍

| 功能 | 目前提供 |
| --- | --- |
| 帳號 | 註冊、Email 驗證／重寄、登入登出、密碼重設與帳號管理 |
| 工作區與專案 | 個人／共享工作區、成員邀請、角色權限、專案新增／更名／刪除 |
| 畫布 | 資料池、資料架構區、發散思考區、收斂總結區；節點編輯、分色、拖曳、連線與連線文字 |
| AI | 使用者自行設定 Gemini Key；對話轉節點、資料架構生成、依發散內容收斂 |
| 保存 | Neon 正規化資料表、自動儲存、離線失敗重試、版本衝突拒絕 |
| 檔案 | R2 私人 bucket、20 MB 以內非空檔案、預簽上傳、完成確認與授權下載 |
| 匯出 | PDF 分頁；PNG 依資料池與三區分片，包成 ZIP；保留節點底色與連線 |

共享工作區以版本檢查保護輪流編輯，不提供即時共編或自動合併衝突。上傳的檔案供保存與下載，不提供 PDF 解析或 RAG 檢索。

## 技術與目錄

Node.js 24.x、pnpm 11.19.0 workspace；前後端皆為 Next.js 16／TypeScript。前端使用 React Flow、Tailwind CSS、Tabler Icons；後端使用 Drizzle／Neon、JWT、scrypt、AES-256-GCM、Resend、R2 與 Gemini SDK。

```text
frontend/src/        頁面、UI、畫布與 API client（開發埠 3000）
frontend/public/     品牌圖片與靜態資源
backend/app/api/    Next.js Route Handlers（開發埠 3001）
backend/server/     驗證、權限、持久化、檔案與服務邏輯
backend/src/db/     Drizzle schema 與 Neon client
backend/drizzle/    migration、journal 與 schema snapshots
e2e/               Playwright 瀏覽器測試
scripts/           測試入口、環境／密鑰／資料庫隔離檢查
docs/              現行設定、部署、防護與驗收文件
```

網站 metadata 位於 `frontend/src/lib/site-metadata.ts`，分享圖為 `frontend/public/brand/og-image.png`（1200 × 630）。修改圖面後可執行 `node scripts/generate-og-image.mjs` 重新輸出，需已安裝 Playwright Chromium 與繁體中文字型。

## 本機啟動

先安裝 Node.js 24.x 與 pnpm 11.19.0。在 repository 根目錄執行，不要混用 npm 或分開安裝兩個 package。

```powershell
pnpm install --frozen-lockfile
if (!(Test-Path backend/.env.local)) { Copy-Item backend/.env.example backend/.env.local }
if (!(Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
pnpm dev
```

開啟 [本機前端](http://localhost:3000)；API 為 `http://localhost:3001/api`，健康檢查為 `/api/health`。本機前後端統一使用 localhost，不混用 127.0.0.1。

> [!IMPORTANT]
> 未設定 `DATABASE_URL` 才是記憶體模式，重啟後資料清空；只填 `DATA_MODE=memory` 不會覆蓋已存在的資料庫連線。既有環境檔不可直接覆寫，也不要為了本機測試更動原本 production 連線。需要完全隔離的流程時使用測試入口，見 [測試指南](docs/10-e2e-testing.md)。

開發環境未設定 Resend 時，驗證／重設連結會出現在 backend 終端機；註冊仍需完成 Email 驗證才能登入。正式環境不使用終端機寄信 fallback。

## 環境設定

| 檔案／變數 | 用途 |
| --- | --- |
| `frontend/.env.local` → `NEXT_PUBLIC_API_BASE_URL` | 本機為 `http://localhost:3001/api`；正式值只填 Vercel Frontend |
| `backend/.env.local` → `FRONTEND_URL`、`PUBLIC_APP_URL` | 本機前端來源及郵件連結；正式使用同站 HTTPS 網域 |
| `DATABASE_URL` | Neon 資料庫連線 |
| `JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET` | 不同的登入簽署密鑰 |
| `USER_API_KEY_ENCRYPTION_KEY` | base64 編碼的 32-byte AES key；已有資料時不可直接更換 |
| `RESEND_API_KEY`、`EMAIL_FROM` | 註冊驗證與密碼重設郵件 |
| `R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` | 檔案保存；bucket CORS 必須允許實際前端來源 |
| `GEMINI_MODEL` | 沿用帳號可用的模型；未設定時程式預設 `gemini-2.5-flash` |
| `backend/.env.test.local` → `TEST_DATABASE_URL` | 獨立、可丟棄的 Neon 測試分支；不填 Vercel |

Gemini Key 由使用者登入後在「AI Key」設定，不設共用的前端密鑰。完整步驟見 [本機開發](docs/01-local-development.md)、[JWT／管理員](docs/07-jwt-and-admin.md)、[Gemini](docs/04-gemini-api-key.md)、[R2](docs/03-cloudflare-r2.md)。

## 第一次使用

1. 註冊並從 Email 或開發終端機連結完成驗證，再登入。
2. 在個人工作區新增專案；需要共享時建立工作區並邀請已註冊帳號。
3. 資料池加入文字、連結或檔案；設定自己的 AI Key 後建立資料架構。
4. 雙擊節點編輯標題、內容及底色，雙擊連線編輯關係文字。
5. 發散思考後按「整理成結論」。收斂以發散節點內容、連線與重要標記為主，AI 語意仍需人工確認。
6. 修改後等「已儲存」再離開；衝突時先複製未儲存文字，不直接重整丟棄。
7. 展開三區後匯出 PDF 或 PNG。PNG 下載是 ZIP，PDF 以 A4 橫式分頁。

## 測試與檢查

| 指令 | 範圍 |
| --- | --- |
| `pnpm lint`、`pnpm typecheck` | 靜態檢查 |
| `pnpm test` | 前後端單元測試 |
| `pnpm test:e2e:api` | API 流程；記憶體與服務替身 |
| `pnpm exec playwright install chromium` | 首次安裝測試瀏覽器 |
| `pnpm test:e2e` | 隔離的 3100／3101 瀏覽器流程 |
| `pnpm check:test-db` | 離線檢查測試庫與正式庫隔離，不連線 |
| `pnpm test:db` | 只在專用測試分支執行 migration、跨程序還原／衝突／回滾測試 |
| `pnpm check:env` | 不輸出密鑰的本機設定檢查 |
| `pnpm test:secrets` | 密鑰掃描器隔離測試 |
| `pnpm check:secrets -- --staged --history` | 檢查暫存區與本機可見 Git 歷史 |
| `pnpm build` | 前後端 Webpack 正式建置 |
| `pnpm check` | lint、型別、單元測試、建置；不包含所有 E2E／DB／密鑰測試 |

測試隔離方式見 [測試指南](docs/10-e2e-testing.md)，人工檢查見 [驗收項目](docs/12-acceptance-report.md)。測試輸出、環境檔與套件不進 Git。密鑰掃描不保證識別所有格式，仍需人工檢查差異。

## 部署與防護

同一 repository 建立兩個 Vercel Project，Root Directory 分別為 `frontend` 與 `backend`，Node 24.x、pnpm 11.19.0、Build Command `pnpm build`。正式網址：

- 前端：`https://context-flow.fengyenchia.com`
- API：`https://api.context-flow.fengyenchia.com/api`

兩端使用同站 HTTPS 網域以配合 refresh cookie 的 `SameSite=Lax`。正式密鑰只放 Backend Production，不複製到 Preview 或 `NEXT_PUBLIC_*`。重新部署不需重跑已套用的 migration。

部署設定見 [Vercel 部署](docs/08-vercel-deployment.md)、[Backend 防護](docs/15-backend-security.md) 與 [上線檢查清單](docs/11-release-checklist.md)。

## 常見問題與限制

- 上傳 `Failed to fetch`：確認失敗的是 API 還是 R2 PUT；bucket CORS 的 AllowedOrigins 需包含正式前端的完整 origin，不加路徑或結尾斜線。不要公開 bucket 來解決 CORS。
- 重整後登出：檢查前後端網址、HTTPS、cookie、精確 CORS 來源與部署保護。
- `/api/health` 正常：只代表服務與設定存在，不代表已實際測過資料庫、檔案或寄信。
- 刪除專案：資料庫檔案紀錄會移除，R2 原始物件不會自動清空；清理前須另核對引用。
- 舊圖片只保存失效 `blob:` 網址時，需重新上傳原圖，無法還原已遺失的圖片內容。
- 現有登入限流為每個程序的記憶體計數；公開站另需平台層防護，不等同全球唯一計數器。

其他文件由 [docs/README.md](docs/README.md) 分流。
