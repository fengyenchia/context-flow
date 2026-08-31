import { api } from './client';
import type { AdminUser, GlobalRole } from './types';

export const listUsers = () => api<AdminUser[]>('/admin/users');
export const updateUserStatus = (id: string, status: 'active' | 'suspended') => api(`/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const updateUserRole = (id: string, role: GlobalRole) => api(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
