export type GlobalRole = 'user' | 'admin';
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface CurrentUser { id: string; username: string; email?: string; emailVerifiedAt?: string; displayName: string; role: GlobalRole; status: 'active' | 'suspended'; hasAiKey: boolean; }
export interface AuthSession { accessToken?: string; user: CurrentUser; emailVerificationSent?: boolean; }
export interface Workspace { id: string; name: string; kind: 'personal' | 'shared'; role: WorkspaceRole; projectCount: number; memberCount: number; }
export interface Project { id: string; workspaceId: string; name: string; description: string; layoutDirection: 'LR' | 'TB'; roomId?: string; role?: WorkspaceRole; collaborationEnabled?: boolean; canvasBackupEnabled?: boolean; projectInvitesEnabled?: boolean; accessSource?: 'workspace' | 'invitation'; }
export type DataResourceKind = 'text' | 'link' | 'file' | 'image';
export interface DataResource { id: string; kind: DataResourceKind; title: string; content?: string; url?: string; contentHash?: string; }
export interface DataZoneNode { id: string; label: string; description: string; sourceIds: string[]; kind: 'core' | 'reference' | 'insight'; }
export interface DataZoneEdge { source: string; target: string; label: string; }
export interface DataZoneStructure { summary: string; nodes: DataZoneNode[]; edges: DataZoneEdge[]; }
export interface Invitation { id: string; workspace: { id: string; name: string }; role: Exclude<WorkspaceRole, 'owner'>; }
export interface AiCredential { provider: 'gemini'; keyHint: string; lastValidatedAt?: string; updatedAt: string; }
export interface AdminUser extends CurrentUser { workspaceCount: number; projectCount: number; createdAt: string; lastLoginAt?: string; }
export interface PasswordResetResult { resetCode: string; expiresAt: string; warning?: string; }
export interface AiChatResult { content: string; model: string; }
export interface CanvasSnapshot { nodes: Array<{ id: string; position: { x: number; y: number }; data?: Record<string, unknown>; style?: Record<string, unknown> }>; edges: Array<Record<string, unknown>>; convergenceNodes?: Array<{ id: string; position: { x: number; y: number }; data?: Record<string, unknown>; style?: Record<string, unknown> }>; convergenceEdges?: Array<Record<string, unknown>>; resources?: DataResource[]; conversations?: Record<string, string[]>; summary?: string; updatedAt?: string | null; }
