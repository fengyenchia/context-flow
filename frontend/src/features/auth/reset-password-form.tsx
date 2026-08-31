'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestPasswordReset, resetPassword } from '@/lib/api/auth';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await resetPassword({ resetCode: String(data.resetCode), newPassword: String(data.newPassword) });
      router.replace('/login?reset=1');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '重設失敗');
    } finally {
      setLoading(false);
    }
  }

  async function requestReset() {
    if (!email.trim()) return;
    setError('');
    try { const result = await requestPasswordReset(email.trim()); setRequested(true); setError(result.message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '無法寄出重設信件'); }
  }

  return <div className="space-y-5">
    <div className="rounded-primary border border-primary/20 bg-primary/10 p-4"><p className="text-sm font-semibold">用 Email 取得重設連結</p><p className="mt-1 text-xs leading-5 text-muted">輸入註冊時使用的 Email，系統會寄出 30 分鐘有效的重設連結。</p><div className="mt-3 flex gap-2"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" aria-label="註冊 Email" /><Button type="button" variant="outline" onClick={requestReset} disabled={!email.trim() || requested}>寄送</Button></div></div>
    <form className="space-y-5" onSubmit={submit}>
    <div className="space-y-2"><label htmlFor="resetCode" className="text-sm font-medium">Email 連結驗證碼</label><Input id="resetCode" name="resetCode" autoComplete="off" defaultValue={searchParams.get('code') ?? ''} required /></div>
    <div className="space-y-2"><label htmlFor="newPassword" className="text-sm font-medium">新密碼</label><Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></div>
    {error && <p className="rounded-primary bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
    <Button className="w-full" type="submit" disabled={loading}>{loading ? '處理中…' : '設定新密碼'}</Button>
    <p className="text-center text-sm text-muted">請從 Email 連結進入後完成設定。 <Link href="/login" className="font-semibold text-primary hover:underline">返回登入</Link></p>
    </form>
  </div>;
}
