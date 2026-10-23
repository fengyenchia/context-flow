# 帳號安全、管理員與密碼重設

## JWT 與 session

`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET` 使用不同的高強度值，僅放 backend；新空白環境可各產生一次：

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

issuer 為 `context-flow`，audience 為 `context-flow-web`；Access 有效 15 分鐘，Refresh 有效 30 天。

Access token 只放前端記憶體；Refresh 放 HttpOnly cookie，正式環境為 Secure、SameSite=Lax、Path=/api/auth。Refresh 輪替並保存 session；登出或密碼重設會撤銷適用的 session。正式前後端採同站 HTTPS 子網域。

## 系統管理員

系統管理員可在 `/admin/users` 查看使用者、啟用／停權帳號及調整系統角色。工作區權限仍依成員角色判定。

系統至少保留一位啟用中的管理員，且管理員不能停權自己。

### 初始化

全新、尚無使用者的環境可透過 `INITIAL_ADMIN_USERNAME`、`INITIAL_ADMIN_PASSWORD_HASH` 建立初始管理員。產生密碼雜湊：

```powershell
pnpm --filter @context-flow/backend admin:hash-password "請換成至少8字元的密碼"
```

此指令的密碼會出現在命令列歷史，執行時須使用私人終端機。帳號建立後移除這兩個初始化變數，並重啟 Backend 或重新部署。

密碼、雜湊與連線字串不得提交到 Git。

### 管理員信箱綁定工具

既有 `admin` 帳號尚未綁定信箱時，資料庫維運者可執行：

```powershell
pnpm --filter @context-flow/backend admin:bind-email
```

工具使用 Backend 的 `DATABASE_URL`，只接受啟用中且未綁定信箱的 `admin`。Email 隱藏輸入兩次，再輸入 `BIND ADMIN` 確認；已被其他帳號使用的 Email 不可綁定。更新會撤銷該帳號的舊 session、驗證與密碼重設連結。

綁定後，從登入頁「重寄驗證信」完成驗證，再使用「忘記密碼」設定密碼。連線中斷時，先唯讀確認帳號狀態再重試。

單元測試：`node --test backend/scripts/bind-admin-email.test.mjs`（不連線資料庫）。

## 郵件驗證與重設

- 註冊須完成 Email 驗證；可重寄驗證信。
- 忘記密碼會核對帳號及註冊 Email，寄出 30 分鐘有效的連結。
- 重新寄送會使同帳號先前未使用的重設連結失效；成功使用的連結不可重用。
- 設定新密碼後，舊密碼與舊 session 失效，須重新登入。
- 正式環境需 Resend，不退回開發終端機寄信模式。

平台登入限流設定見 [Backend 防護](15-backend-security.md)。
