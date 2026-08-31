'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { login, register } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/auth-store';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const username = String(payload.username);
      const password = String(payload.password);
      const data = mode === 'register'
        ? await register({ username, email: String(payload.email), password, displayName: String(payload.displayName) })
        : await login({ username, password });
      setSession(data.accessToken, data.user);
      router.push('/workspaces');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '無法完成操作');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-describedby={error ? 'auth-error' : undefined}>
      {mode === 'register' && (
        <div className="space-y-2">
          <label htmlFor="displayName" className="text-sm font-medium">顯示名稱</label>
          <Input id="displayName" name="displayName" autoComplete="name" required maxLength={100} placeholder="例如：小明" />
        </div>
      )}
      {mode === 'register' && <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Email</label><Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" /><p className="text-xs text-muted">註冊驗證與忘記密碼時會使用此 Email。</p></div>}
      <div className="space-y-2">
        <label htmlFor="username" className="text-sm font-medium">帳號</label>
        <Input id="username" name="username" autoComplete="username" required minLength={3} maxLength={50} pattern="[A-Za-z0-9_.-]+" placeholder="your_name" />
        {mode === 'register' && <p className="text-xs text-muted">3–50 字元，可使用英文、數字、底線、句點與連字號。</p>}
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">密碼</label>
        <Input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} placeholder="至少 8 個字元" />
      </div>
      {mode === 'login' && <div className="text-right"><Link className="text-sm font-medium text-primary hover:underline" href="/reset-password">忘記密碼？</Link></div>}
      <div id="auth-error" aria-live="polite" className={error ? 'rounded-primary border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive' : 'min-h-0'}>{error}</div>
      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {mode === 'login' ? '登入 ContextFlow' : '建立帳號'}
        {!loading && <ArrowRight className="size-4" aria-hidden="true" />}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === 'login' ? '還沒有帳號？' : '已經有帳號？'}{' '}
        <Link className="font-semibold text-primary underline-offset-4 hover:underline" href={mode === 'login' ? '/register' : '/login'}>
          {mode === 'login' ? '立即註冊' : '前往登入'}
        </Link>
      </p>
    </form>
  );
}

