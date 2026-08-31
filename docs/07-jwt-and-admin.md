# JWT、管理員與密碼重設

## 產生 JWT secrets

Access 與 refresh 必須使用不同值：

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

分別填入：

```dotenv
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ISSUER=context-flow-api
JWT_AUDIENCE=context-flow-web
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000
```

Access token 放在 frontend memory，不寫 localStorage；refresh token 放 HttpOnly、Secure Cookie。Refresh 時會 rotation，登出或管理員撤銷 session 後不可再使用。

## 建立初始管理員

先產生 Node.js scrypt 密碼雜湊：

```powershell
pnpm --filter @context-flow/backend admin:hash-password "請換成至少8字元的密碼"
```

初始管理員可不設定 Email；一般使用者註冊時必須填寫 Email。登入只需要帳號與密碼，不需要 Email。

把整段 `scrypt$...` 輸出放入：

```dotenv
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD_HASH=scrypt$...
```

Memory mode 每次啟動會重建這個管理員。正式 Neon adapter 完成後，初始管理員應改用一次性 seed/migration，不應每次冷啟動建立。

## 忘記密碼流程

1. 使用者在登入頁點「忘記密碼？」並輸入註冊 Email。
2. 系統寄出 30 分鐘有效的重設連結。
3. 使用者由 Email 連結設定新密碼。
4. 成功後舊 session 全部失效。

系統不再提供管理員手動產生 reset code；管理員只負責帳號狀態與角色管理。
