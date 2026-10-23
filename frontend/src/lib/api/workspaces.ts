import { api } from './client';
import type { Invitation, Workspace, WorkspaceRole } from './types';

export const listWorkspaces = () => api<Workspace[]>('/workspaces');
export interface WorkspaceMember { userId: string; username: string; displayName: string; role: WorkspaceRole; }
export const listMembers = (id: string) => api<WorkspaceMember[]>(`/workspaces/${id}/members`);
export const changeMemberRole = (id: string, userId: string, role: string) => api(`/workspaces/${id}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
export const removeMember = (id: string, userId: string) => api(`/workspaces/${id}/members/${userId}`, { method: 'DELETE' });
export const createWorkspace = (name: string) => api<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
export const listInvitations = () => api<Invitation[]>('/workspace-invitations');
export const respondToInvitation = (id: string, action: 'accept' | 'decline') => api<{ ok: true }>(`/workspace-invitations/${id}/${action}`, { method: 'POST' });
export const inviteWorkspaceMember = (workspaceId: string, username: string, role: Exclude<WorkspaceRole, 'owner'>) => api(`/workspaces/${workspaceId}/invitations`, { method: 'POST', body: JSON.stringify({ username, role }) });
