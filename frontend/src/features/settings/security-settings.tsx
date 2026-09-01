'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requestPasswordReset } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { SettingsFrame } from './account-settings';

export function SecuritySettings() {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function sendResetEmail() {
    if (!user?.email) { setError('帳號尚未設定 Email，請先到帳號設定補上。'); return; }
    setLoading(true); setError(''); setMessage('');
    try { const result = await requestPasswordReset({ username: user.username, email: user.email }); setMessage(result.message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '無法寄出驗證信'); }
    finally { setLoading(false); }
  }

  return <SettingsFrame title="密碼與安全性" description="使用註冊 Email 驗證後重新設定密碼。">
    <Card><CardHeader><CardTitle>透過 Email 重設密碼</CardTitle><CardDescription>我們會寄送重設連結到 {user?.email || '你的註冊 Email'}。</CardDescription></CardHeader><CardContent className="space-y-4">
      <Button type="button" onClick={sendResetEmail} disabled={loading || !user?.email}>{loading ? '寄送中…' : '寄送 Email 驗證連結'}</Button>
      {message && <p className="text-sm text-primary" role="status">{message}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <p className="text-xs leading-5 text-muted">收到信件後，點擊連結即可設定新的 8 位以上密碼；完成後所有裝置都需要重新登入。</p>
    </CardContent></Card>
  </SettingsFrame>;
}
