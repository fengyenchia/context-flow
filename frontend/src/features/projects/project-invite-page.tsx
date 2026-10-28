"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { acceptProjectLink, previewProjectLink } from '@/lib/api/project-invites';
import { ApiError } from '@/lib/api/client';

export const pendingInviteKey = 'contextflow-pending-project-invite';
export function ProjectInvitePage() {
  const router = useRouter(); const { user, ready } = useAuthStore();
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<{ name: string; role: string } | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value = window.location.hash.slice(1) || sessionStorage.getItem(pendingInviteKey) || '';
      if (/^[A-Za-z0-9_-]{43}$/.test(value)) { sessionStorage.setItem(pendingInviteKey, value); setToken(value); }
      else { sessionStorage.removeItem(pendingInviteKey); setError('邀請連結無效，請向專案管理者取得新連結'); }
      window.history.replaceState(null, '', window.location.pathname);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready || !user || !token) return;
    let active = true;
    previewProjectLink(token).then(value => { if (active) setPreview(value); }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 410) sessionStorage.removeItem(pendingInviteKey);
      setError(error instanceof Error ? error.message : '無法讀取邀請');
    });
    return () => { active = false; };
  }, [ready, user, token]);
  async function accept() {
    setBusy(true); setError('');
    try { const project = await acceptProjectLink(token); sessionStorage.removeItem(pendingInviteKey); router.replace(`/workspaces/${project.workspaceId}/projects/${project.id}`); }
    catch (error) { setError(error instanceof Error ? error.message : '無法接受邀請'); }
    finally { setBusy(false); }
  }
  return <main id="main-content" className="grid min-h-screen place-items-center bg-background p-5"><section className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 shadow-sm">
    <BrandLogo className="mb-5 size-10" /><h1 className="text-2xl font-semibold">專案邀請</h1>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {!ready && <p role="status" className="mt-4 text-sm text-muted">正在確認登入狀態…</p>}
    {ready && !user && token && <><p className="my-4 text-sm text-muted">登入後接受邀請，只取得這個專案的權限。</p><Link href="/login?next=/project-invite" className="inline-flex h-10 items-center rounded-primary bg-primary px-4 text-sm font-semibold text-surface">登入並繼續</Link></>}
    {user && preview && <><h2 className="mt-5 text-lg font-semibold">{preview.name}</h2><p className="my-3 text-sm text-muted">權限：{preview.role === 'editor' ? '可編輯' : '僅檢視'}。接受後不會加入整個工作區。</p><Button disabled={busy} onClick={() => void accept()}>{busy ? '加入中…' : '接受邀請'}</Button></>}
    <Link href="/workspaces" onClick={() => sessionStorage.removeItem(pendingInviteKey)} className="mt-5 block text-sm text-muted underline">返回工作區</Link>
  </section></main>;
}
