# 帳號安全、管理員與密碼重設

## JWT 與 session

`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET` 使用不同的高強度值，僅放 backend；新空白環境可各產生一次：

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

既有正式環境沿用原值。程式目前固定 issuer `context-flow`、audience `context-flow-web`，Access 有效 15 分鐘、Refresh 30 天；未讀取 `JWT_ISSUER`、`JWT_AUDIENCE` 或 `JWT_*_TTL_SECONDS` 自訂參數。

Access token 只放前端記憶體；Refresh 放 HttpOnly cookie，正式環境為 Secure、SameSite=Lax、Path=/api/auth。Refresh 輪替並保存 session；登出或密碼重設會撤銷適用的 session。正式前後端採同站 HTTPS 子網域。

## 既有環境的管理員設定

系統管理員角色保存在資料庫的 `users.role`，不由 `INITIAL_ADMIN_USERNAME` 決定。既有帳號升為管理員後，沿用原帳號與密碼登入；不需要保留初始管理員帳號或重新初始化。

完成初始化後，從本機 `backend/.env`、`backend/.env.local` 及 Vercel Backend 環境變數中移除 `INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD_HASH`。不要改填目前管理員的帳號或密碼。移除不影響現有管理員、專案或登入密碼，`.env.example` 也不再預填這兩項。

本機環境檔修改後，需停止並重新啟動 Backend 開發服務，既有程序不會自動清除已載入的變數；Vercel 需重新部署 Backend。Vercel 上的移除與重新部署由維運者操作，不能視為本機清理已同步完成。

### 僅限全新空白環境的初始管理員

`INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD_HASH` 只在使用者集合為空時建立已驗證的系統管理員。已有正式帳號時不需要重新初始化，也不應為部署重新填入 bootstrap 密碼。

只有全新、尚無使用者的獨立環境，才暫時設定 `INITIAL_ADMIN_USERNAME` 與 `INITIAL_ADMIN_PASSWORD_HASH`；不要在現有 production 執行此初始化。需要雜湊時可執行：

```powershell
pnpm --filter @context-flow/backend admin:hash-password "請換成至少8字元的密碼"
```

輸入會出現在本機命令列／歷史，勿共享該終端機紀錄；將輸出 hash 安全存入 backend 環境設定，完成 bootstrap 後移除初始管理員變數。不要提交明文、hash 或連線字串。

目前沒有額外的一次性 seed 工具；不要將計畫中的 seed 當作已實作流程。管理員功能為帳號狀態與系統角色管理，不提供手動發行密碼重設碼。

## 郵件驗證與重設

### 舊管理員尚未綁定 Email

資料庫維運者可在自己的互動式終端機執行：

```powershell
pnpm --filter @context-flow/backend admin:bind-email
```

工具使用 backend 原本的 `DATABASE_URL`（環境變數優先，其次 `.env.local`、`.env`），不載入 `.env.test.local`，不切換連線或初始化帳號。Email 隱藏輸入兩次，再輸入 `BIND ADMIN` 才更新。只接受既有、啟用中、尚未綁定 Email 的 `admin`，並拒絕已被使用的 Email；不回顯信箱、不寫檔、不修改密碼，也不跳過驗證。更新會使舊 session、驗證與重設連結失效。這是本機維運工具，不是公開 API；不得將資料庫維運權限交給一般使用者。

綁定完成後，在正式登入頁輸入 `admin` →「重寄驗證信」→ 輸入綁定信箱並寄送，從信中完成驗證。再回登入頁輸入 `admin` →「忘記密碼」→ 輸入同一信箱寄送重設信，從信中設定新密碼後登入。信箱、密碼及帶 token 的連結都不要貼到對話或截圖中。若工具連線中斷，不確定是否成功，先唯讀確認狀態，不要盲目重試。

工具單元測試（不連線資料庫）：`node --test backend/scripts/bind-admin-email.test.mjs`。

若提示 Email 已被使用，請改用另一個尚未註冊、可收信的 Email。工具不會合併帳號、替換其他人的信箱或將一般帳號升級。錯誤只回報安全的分類，不顯示 Email、SQL 參數或連線字串。

- 註冊須完成 Email 驗證；可重寄驗證信。
- 忘記密碼會核對帳號及註冊 Email，寄出 30 分鐘有效的連結。
- 重新寄送會使同帳號先前未使用的重設連結失效；成功使用的連結不可重用。
- 設定新密碼後，舊密碼與舊 session 失效，須重新登入。
- 正式環境需 Resend，不退回開發終端機寄信模式。

使用者已回報正式站郵件／密碼重設驗收完成。登入限流目前是每個後端程序的記憶體計數，平台層防護另依 [Backend 防護](15-backend-security.md) 設定。
