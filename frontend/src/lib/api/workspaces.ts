import { api } from './client';
import type { Invitation, Workspace, WorkspaceRole } from './types';

export const listWorkspaces = () => api<Workspace[]>('/workspaces');
export const createWorkspace = (name: string) => api<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
export const listInvitations = () => api<Invitation[]>('/workspace-invitations');
export const respondToInvitation = (id: string, action: 'accept' | 'decline') => api<{ ok: true }>(`/workspace-invitations/${id}/${action}`, { method: 'POST' });
export const inviteWorkspaceMember = (workspaceId: string, username: string, role: Exclude<WorkspaceRole, 'owner'>) => api(`/workspaces/${workspaceId}/invitations`, { method: 'POST', body: JSON.stringify({ username, role }) });
