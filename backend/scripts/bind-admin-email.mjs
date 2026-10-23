import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { emitKeypressEvents } from 'node:readline';

const bindingMessages = {
  EMAIL_IN_USE: '未綁定：這個 Email 已被其他帳號使用。請使用另一個可收信且尚未註冊的 Email；不會合併帳號或轉移權限。',
  ALREADY_BOUND: '未修改：admin 已綁定 Email。請先確認目前狀態，不要覆寫。',
  ADMIN_UNAVAILABLE: '未綁定：找不到啟用中的 admin 系統管理員。',
  CONNECTION_FAILED: '連線失敗，無法確認綁定結果。請先唯讀確認狀態，再決定是否重試。',
  SERIALIZATION_FAILURE: '資料庫同時有其他更新；本次交易已回滾，未完成綁定。請稍後重試。',
  UNIQUE_CONFLICT: '資料庫唯一性檢查未通過；本次交易已回滾。請確認 Email 是否已被使用。',
  DATABASE_PERMISSION: '資料庫拒絕更新；本次交易未完成。請檢查連線帳號的更新權限。',
  DATABASE_SCHEMA: '資料庫結構與工具不符；本次交易未完成，請檢查 migration。',
};

export class BindingError extends Error {
  constructor(code) {
    super(bindingMessages[code]);
    this.code = code;
  }
}

export function bindingFailure(error) {
  if (error instanceof BindingError) return error.message;
  const codes = { '40001': 'SERIALIZATION_FAILURE', '23505': 'UNIQUE_CONFLICT', '42501': 'DATABASE_PERMISSION', '42P01': 'DATABASE_SCHEMA', '42703': 'DATABASE_SCHEMA' };
  return bindingMessages[codes[error?.code] || 'CONNECTION_FAILED'];
}

export function normalizeEmail(value) {
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(email)) {
    throw new Error('Email 格式不正確；未修改資料。');
  }
  return email;
}

// One serializable transaction: never replace an already bound address,
// never mark it verified, and invalidate old credentials atomically.
export async function bindAdminEmail(sql, value) {
  const email = normalizeEmail(value);
  let rows;
  try {
    [rows] = await sql.transaction([
    sql.query(`
      WITH changed AS (
        UPDATE public.users SET email = $1, email_verified_at = NULL,
          token_version = token_version + 1, updated_at = now()
        WHERE username = 'admin' AND role = 'admin' AND status = 'active'
          AND (email IS NULL OR length(trim(email)) = 0)
          AND NOT EXISTS (SELECT 1 FROM public.users WHERE lower(trim(email)) = $1)
        RETURNING id
      ), revoked AS (
        UPDATE public.refresh_sessions SET revoked_at = now()
        WHERE user_id IN (SELECT id FROM changed) AND revoked_at IS NULL
      ), reset_tokens AS (
        UPDATE public.password_reset_tokens SET consumed_at = now()
        WHERE user_id IN (SELECT id FROM changed) AND consumed_at IS NULL
      ), verification_tokens AS (
        UPDATE public.email_verification_tokens SET consumed_at = now()
        WHERE user_id IN (SELECT id FROM changed) AND consumed_at IS NULL
      )
      SELECT count(*)::int AS changed,
        CASE
          WHEN EXISTS (SELECT 1 FROM changed) THEN 'BOUND'
          WHEN EXISTS (SELECT 1 FROM public.users WHERE username = 'admin'
            AND role = 'admin' AND status = 'active'
            AND email IS NOT NULL AND length(trim(email)) > 0) THEN 'ALREADY_BOUND'
          WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE username = 'admin'
            AND role = 'admin' AND status = 'active') THEN 'ADMIN_UNAVAILABLE'
          ELSE 'EMAIL_IN_USE'
        END AS outcome
      FROM changed
    `, [email]),
    ], { isolationLevel: 'Serializable' });
  } catch (error) {
    const safeError = new Error(bindingFailure(error));
    safeError.code = 'SAFE_BINDING_FAILURE';
    throw safeError;
  }
  if (rows[0]?.changed !== 1) {
    throw new BindingError(['ALREADY_BOUND', 'ADMIN_UNAVAILABLE', 'EMAIL_IN_USE'].includes(rows[0]?.outcome) ? rows[0].outcome : 'CONNECTION_FAILED');
  }
}

export function hiddenInput(prompt, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('請在自己的互動式終端機執行；不接受管線、參數或重導向輸入。');
  }
  output.write(prompt);
  const previousRaw = Boolean(input.isRaw);
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      input.removeListener('keypress', onKey);
      input.setRawMode(previousRaw);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
      value = '';
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && ['c', 'd'].includes(key.name)) return finish(new Error('操作已取消。'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') { value = value.slice(0, -1); return; }
      if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text) && value.length + text.length <= 320) value += text;
    };
    input.on('keypress', onKey);
  });
}

async function main() {
  if (process.argv.length !== 2) throw new Error('不接受命令列參數；Email 必須在隱藏提示中輸入。');
  // Same precedence as the existing production migration tool. Never load
  // .env.test.local or assign TEST_DATABASE_URL to DATABASE_URL.
  for (const file of ['../.env.local', '../.env']) {
    const location = new URL(file, import.meta.url);
    if (existsSync(location)) process.loadEnvFile(fileURLToPath(location));
  }
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === 'test') throw new Error('正式 DATABASE_URL 未設定，或目前為測試環境；停止操作。');
  console.log('只替既有且尚未綁定 Email 的 admin 綁定信箱。使用原本 DATABASE_URL，不改連線設定。');
  console.log('Email 不回顯、不寫檔；本工具不需要密碼。Ctrl+C 可取消。');
  let email = normalizeEmail(await hiddenInput('輸入 Email（隱藏）：'));
  const confirmation = normalizeEmail(await hiddenInput('再輸入一次 Email（隱藏）：'));
  if (email !== confirmation) throw new Error('兩次 Email 不一致；未修改資料。');
  if (await hiddenInput('確認要更新正式資料庫：輸入 BIND ADMIN（隱藏）：') !== 'BIND ADMIN') throw new Error('未確認；未修改資料。');
  const { neon } = await import('@neondatabase/serverless');
  try {
    await bindAdminEmail(neon(process.env.DATABASE_URL), email);
  } catch (error) {
    // Do not print DB errors: they can contain addresses, SQL parameters or URLs.
    if (error instanceof BindingError || error?.code === 'SAFE_BINDING_FAILURE') throw error;
    throw new BindingError('CONNECTION_FAILED');
  } finally { email = ''; }
  console.log('綁定完成，尚未驗證 Email。舊 session 與未使用的驗證／重設連結已失效。');
  console.log('下一步：正式網站 /login → 帳號 admin → 重寄驗證信 → 輸入剛才信箱 → 寄送驗證信。');
  console.log('點信中驗證連結後，回登入頁輸入 admin → 忘記密碼 → 輸入同一信箱 → 寄送。');
  console.log('從重設信設定新密碼，再以 admin 登入。不要分享信箱、密碼或信中連結。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Only explicitly authored, non-sensitive errors escape main.
    console.error(error instanceof BindingError || (error?.code === 'SAFE_BINDING_FAILURE' && Object.values(bindingMessages).includes(error.message)) ? error.message : error instanceof Error && [
      'Email 格式不正確；未修改資料。', '操作已取消。',
      '請在自己的互動式終端機執行；不接受管線、參數或重導向輸入。',
      '不接受命令列參數；Email 必須在隱藏提示中輸入。',
      '正式 DATABASE_URL 未設定，或目前為測試環境；停止操作。',
      '兩次 Email 不一致；未修改資料。', '未確認；未修改資料。',
      '未能確認綁定結果。請先唯讀確認帳號狀態，再決定是否重試；不顯示資料庫錯誤細節。',
    ].includes(error.message) ? error.message : '操作停止；錯誤細節已隱藏，請先確認帳號狀態。');
    process.exitCode = 1;
  });
}
