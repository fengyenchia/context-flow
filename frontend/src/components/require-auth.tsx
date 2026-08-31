'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, user } = useAuthStore();
  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  if (!ready || !user) return <main className="grid min-h-screen place-items-center"><div className="flex items-center gap-3 text-sm text-muted"><Loader2 className="size-5 animate-spin" />正在確認登入狀態…</div></main>;
  return children;
}

