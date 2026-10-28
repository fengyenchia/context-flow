import { api } from './client';
import type { AiChatResult, CanvasSnapshot, DataResource, DataZoneStructure, Project } from './types';

export const listProjects = (workspaceId: string) => api<Project[]>(`/workspaces/${workspaceId}/projects`);
export const createProject = (workspaceId: string, input: { name: string; description?: string; layoutDirection: 'LR' | 'TB' }) => api<Project>(`/workspaces/${workspaceId}/projects`, { method: 'POST', body: JSON.stringify(input) });
export const getProject = (projectId: string) => api<Project>(`/projects/${projectId}`);
export const updateProject = (projectId: string, input: { name: string; description: string }) => api<Project>(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteProject = (projectId: string) => api<{ ok: true }>(`/projects/${projectId}`, { method: 'DELETE' });
export const getCanvas = (projectId: string) => api<CanvasSnapshot>(`/projects/${projectId}/canvas`);
export const saveCanvas = (projectId: string, snapshot: Omit<CanvasSnapshot, 'updatedAt'> & { baseUpdatedAt: string | null }) => api<CanvasSnapshot>(`/projects/${projectId}/canvas`, { method: 'PUT', body: JSON.stringify(snapshot) });
export const askProjectAssistant = (projectId: string, prompt: string, options?: { concise?: boolean }) => api<AiChatResult>('/ai/chat', { method: 'POST', body: JSON.stringify({ projectId, prompt, ...options }) });
export const generateDataZone = (projectId: string, resources: DataResource[]) => api<DataZoneStructure>(`/projects/${projectId}/data-zone/structure`, { method: 'POST', body: JSON.stringify({ resources }) });

export type CanvasBackup = { id: string; capturedAt: string; sizeBytes: number };
export type CanvasBackupPolicy = { maxVersions: number; maxAgeDays: number; autoIntervalMinutes: number };
export const listCanvasBackups = (projectId: string, cursor?: string) => api<{ backups: CanvasBackup[]; cursor: string | null; policy?: CanvasBackupPolicy }>(`/projects/${projectId}/backups${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
export const captureCanvasBackup = (projectId: string) => api<CanvasBackup & { skipped?: 'unchanged' | 'scheduled' }>(`/projects/${projectId}/backups`, { method: 'POST' });
export const restoreCanvasBackup = (projectId: string, id: string) => api<Project>(`/projects/${projectId}/backups/${id}/restore`, { method: 'POST' });
