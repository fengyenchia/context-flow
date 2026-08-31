'use client';

import { useEffect } from 'react';
import { refreshSession } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setReady = useAuthStore((state) => state.setReady);
  useEffect(() => {
    refreshSession().catch(() => setReady(true));
  }, [setReady]);
  return children;
}

