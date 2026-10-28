import { api } from './client';
import type { Project } from './types';

export type ProjectInviteLink = { id: string; role: 'editor' | 'viewer'; expiresAt: string; createdAt: string; revokedAt: string | null; joinedCount: number };
export const listProjectLinks = (id: string) => api<ProjectInviteLink[]>(`/projects/${id}/invite-links`);
export const createProjectLink = (id: string, role: string, expiresAt: string) => api<ProjectInviteLink & { url: string }>(`/projects/${id}/invite-links`, { method: 'POST', body: JSON.stringify({ role, expiresAt }) });
export const revokeProjectLink = (id: string, linkId: string) => api(`/projects/${id}/invite-links/${linkId}`, { method: 'DELETE' });
export const changeProjectLinkRole = (id: string, linkId: string, role: string) => api(`/projects/${id}/invite-links/${linkId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
export const previewProjectLink = (token: string) => api<{ name: string; role: 'editor' | 'viewer'; expiresAt: string }>('/project-invitations/preview', { method: 'POST', body: JSON.stringify({ token }) });
export const acceptProjectLink = (token: string) => api<Project>('/project-invitations/accept', { method: 'POST', body: JSON.stringify({ token }) });
export const listSharedProjects = () => api<Project[]>('/shared-projects');
