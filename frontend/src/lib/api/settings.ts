import { api } from './client';
import type { AiCredential, CurrentUser } from './types';

export const updateProfile = (displayName: string) => api<CurrentUser>('/account/profile', { method: 'PATCH', body: JSON.stringify({ displayName }) });
export const changePassword = (currentPassword: string, newPassword: string) => api<{ ok: true }>('/account/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
export const listAiCredentials = () => api<AiCredential[]>('/account/ai-credentials');
export const saveGeminiKey = (apiKey: string) => api<AiCredential>('/account/ai-credentials/gemini', { method: 'PUT', body: JSON.stringify({ apiKey }) });
export const testGeminiKey = () => api<{ ok: true }>('/account/ai-credentials/gemini/test', { method: 'POST' });
export const deleteGeminiKey = () => api<{ ok: true }>('/account/ai-credentials/gemini', { method: 'DELETE' });
