'use client';

import { create } from 'zustand';
import type { CurrentUser } from '@/lib/api/types';

interface AuthState {
  accessToken?: string;
  user?: CurrentUser;
  ready: boolean;
  setSession: (accessToken: string, user: CurrentUser) => void;
  setReady: (ready: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  setSession: (accessToken, user) => set({ accessToken, user, ready: true }),
  setReady: (ready) => set({ ready }),
  clear: () => set({ accessToken: undefined, user: undefined, ready: true }),
}));
