import { api } from './client';
import type { AiChatResult, CanvasSnapshot, DataResource, DataZoneStructure, Project } from './types';

export const listProjects = (workspaceId: string) => api<Project[]>(`/workspaces/${workspaceId}/projects`);
export const createProject = (workspaceId: string, input: { name: string; description?: string; layoutDirection: 'LR' | 'TB' }) => api<Project>(`/workspaces/${workspaceId}/projects`, { method: 'POST', body: JSON.stringify(input) });
export const getProject = (projectId: string) => api<Project>(`/projects/${projectId}`);
export const getCanvas = (projectId: string) => api<CanvasSnapshot>(`/projects/${projectId}/canvas`);
export const saveCanvas = (projectId: string, snapshot: Omit<CanvasSnapshot, 'updatedAt'>) => api<CanvasSnapshot>(`/projects/${projectId}/canvas`, { method: 'PUT', body: JSON.stringify(snapshot) });
export const askProjectAssistant = (projectId: string, prompt: string, options?: { concise?: boolean }) => api<AiChatResult>('/ai/chat', { method: 'POST', body: JSON.stringify({ projectId, prompt, ...options }) });
export const generateDataZone = (projectId: string, resources: DataResource[]) => api<DataZoneStructure>(`/projects/${projectId}/data-zone/structure`, { method: 'POST', body: JSON.stringify({ resources }) });
