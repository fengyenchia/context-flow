'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { updateProfile } from '@/lib/api/settings';
import { useAuthStore } from '@/stores/auth-store';

export function AccountSettings() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setSession = useAuthStore((state) => state.setSession);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [message, setMessage] = useState('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const updated = await updateProfile(displayName);
    if (accessToken) setSession(accessToken, updated);
    setMessage('帳號資料已更新。');
  }

  return <SettingsFrame title="帳號設定" description="管理你的公開名稱與登入帳號。">
    <Card><CardHeader><CardTitle>個人資料</CardTitle><CardDescription>使用者名稱建立後不可自行更改。</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={save}>
      <Field label="使用者名稱"><Input value={user?.username ?? ''} disabled /></Field>
      <Field label="顯示名稱"><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={1} maxLength={100} required /></Field>
      {message && <p className="text-sm text-primary" role="status">{message}</p>}
      <Button type="submit">儲存變更</Button>
    </form></CardContent></Card>
  </SettingsFrame>;
}

export function SettingsFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl p-5 md:p-10"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-sm text-muted">{description}</p><div className="mt-7 space-y-5">{children}</div></div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-medium">{label}</span>{children}</label>;
}

