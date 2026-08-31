import { api } from './client';
import type { AuthSession } from './types';

export const register = (input: { username: string; email: string; displayName: string; password: string }) => api<AuthSession>('/auth/register', { method: 'POST', body: JSON.stringify(input) }, false);
export const login = (input: { username: string; password: string }) => api<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(input) }, false);
export const requestPasswordReset = (email: string) => api<{ ok: true; message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }, false);
export const verifyEmail = (token: string) => api<{ ok: true; message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`, {}, false);
export const logout = () => api<{ ok: true }>('/auth/logout', { method: 'POST' });
export const resetPassword = (input: { resetCode: string; newPassword: string }) => api<{ ok: true }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(input) }, false);
