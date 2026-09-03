'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { requestPasswordReset, resetPassword } from '@/lib/api/auth';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const username = searchParams.get('username') ?? '';
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const resetCode = searchParams.get('code');
      if (!resetCode) { setError('請從 Email 中點擊重設按鈕後再設定密碼'); return; }
      await resetPassword({ resetCode, newPassword: String(data.newPassword) });
      router.replace('/login?reset=1');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '重設失敗');
    } finally {
      setLoading(false);
    }
  }

  async function requestReset() {
    if (!email.trim()) return;
    setError(''); setMessage('');
    try { const result = await requestPasswordReset({ username: username.trim(), email: email.trim() }); setMessage(result.message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '無法寄出重設信件'); }
  }

  const hasToken = Boolean(searchParams.get('code'));
  return <div className="space-y-5">
    {!hasToken && <div className="rounded-primary border border-primary/20 bg-primary/10 p-4"><p className="text-sm font-semibold">用 Email 取得重設連結</p><p className="mt-1 text-xs leading-5 text-muted">請輸入註冊時使用的 Email。每次重新寄送後，之前的連結會失效。</p><div className="mt-3 flex gap-2"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" aria-label="註冊 Email" autoComplete="email" /><Button type="button" variant="outline" onClick={requestReset} disabled={!username.trim() || !email.trim()}>寄送</Button></div>{!username && <p className="mt-2 text-sm text-destructive" role="alert">請返回登入頁，先輸入帳號。</p>}{message && <p className="mt-3 text-sm text-primary" role="status">{message}</p>}</div>}
    {hasToken && <form className="space-y-5" onSubmit={submit}>
      <div className="rounded-primary border border-primary/20 bg-primary/10 p-4"><p className="text-sm font-semibold">Email 已驗證</p><p className="mt-1 text-xs leading-5 text-muted">請設定新的密碼，至少 8 個字元。完成後所有裝置都需要重新登入。</p></div>
      <div className="space-y-2"><label htmlFor="newPassword" className="text-sm font-medium">新密碼</label><PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" minLength={8} required placeholder="至少 8 個字元" /></div>
      {error && <p className="rounded-primary bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
      <Button className="w-full" type="submit" disabled={loading}>{loading ? '處理中…' : '設定新密碼'}</Button>
    </form>}
    <p className="text-center text-sm text-muted">{hasToken ? '設定完成後返回登入。' : '收到 Email 後，點擊信中的按鈕即可繼續。'} <Link href="/login" className="font-semibold text-primary hover:underline">返回登入</Link></p>
  </div>;
}
