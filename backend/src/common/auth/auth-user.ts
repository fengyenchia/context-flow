import type { Request } from 'express';

export type GlobalRole = 'user' | 'admin';
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface AuthUser {
  sub: string;
  role: GlobalRole;
  tokenVersion: number;
}

export type AuthenticatedRequest = Request & { user: AuthUser };
