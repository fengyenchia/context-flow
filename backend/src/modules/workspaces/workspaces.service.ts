import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { WorkspaceRole } from '../../common/auth/auth-user.js';
import { AppStore } from '../../db/app-store.js';
import type { CreateWorkspaceDto, InviteMemberDto, UpdateMemberDto } from './workspaces.dto.js';

@Injectable()
export class WorkspacesService {
  constructor(private readonly store: AppStore) {}

  list(userId: string) {
    return this.store.listUserWorkspaces(userId).map((workspace) => ({
      ...workspace,
      projectCount: [...this.store.projects.values()].filter((project) => project.workspaceId === workspace.id).length,
      memberCount: [...this.store.memberships.values()].filter((member) => member.workspaceId === workspace.id).length,
    }));
  }

  create(userId: string, dto: CreateWorkspaceDto) {
    const workspace = { id: randomUUID(), name: dto.name.trim(), kind: 'shared' as const, createdByUserId: userId, createdAt: new Date() };
    this.store.workspaces.set(workspace.id, workspace);
    this.store.setMembership(workspace.id, userId, 'owner');
    this.audit(workspace.id, userId, userId, 'workspace.created', { name: workspace.name });
    return { ...workspace, role: 'owner', projectCount: 0, memberCount: 1 };
  }

  get(userId: string, workspaceId: string) {
    const membership = this.requireRole(workspaceId, userId, ['owner', 'admin', 'editor', 'viewer']);
    const workspace = this.store.requireWorkspace(workspaceId);
    const members = [...this.store.memberships.values()]
      .filter((item) => item.workspaceId === workspaceId)
      .map((item) => ({ ...item, user: this.store.publicUser(this.store.requireUser(item.userId)) }));
    return { ...workspace, role: membership.role, members };
  }

  update(userId: string, workspaceId: string, name: string) {
    this.requireRole(workspaceId, userId, ['owner', 'admin']);
    const workspace = this.store.requireWorkspace(workspaceId);
    workspace.name = name.trim();
    this.audit(workspaceId, userId, undefined, 'workspace.updated', { name: workspace.name });
    return workspace;
  }

  remove(userId: string, workspaceId: string) {
    const workspace = this.store.requireWorkspace(workspaceId);
    if (workspace.kind === 'personal') throw new ForbiddenException('Personal workspace cannot be deleted separately');
    this.requireRole(workspaceId, userId, ['owner']);
    this.store.workspaces.delete(workspaceId);
    for (const [key, member] of this.store.memberships) if (member.workspaceId === workspaceId) this.store.memberships.delete(key);
    for (const [id, project] of this.store.projects) if (project.workspaceId === workspaceId) { this.store.projects.delete(id); this.store.canvasSnapshots.delete(id); }
    return { ok: true };
  }

  invite(userId: string, workspaceId: string, dto: InviteMemberDto) {
    this.requireRole(workspaceId, userId, ['owner', 'admin']);
    const target = this.store.findUserByUsername(dto.username);
    if (!target) throw new NotFoundException('User not found');
    if (this.store.getMembership(workspaceId, target.id)) throw new ConflictException('User is already a member');
    const existing = [...this.store.invitations.values()].find((invite) => invite.workspaceId === workspaceId && invite.targetUserId === target.id && invite.status === 'pending');
    if (existing) throw new ConflictException('A pending invitation already exists');
    const invitation = { id: randomUUID(), workspaceId, targetUserId: target.id, invitedByUserId: userId, role: dto.role, status: 'pending' as const, createdAt: new Date() };
    this.store.invitations.set(invitation.id, invitation);
    this.audit(workspaceId, userId, target.id, 'member.invited', { role: dto.role });
    return invitation;
  }

  listInvitations(userId: string) {
    return [...this.store.invitations.values()]
      .filter((invite) => invite.targetUserId === userId && invite.status === 'pending')
      .map((invite) => ({ ...invite, workspace: this.store.workspaces.get(invite.workspaceId) }));
  }

  respond(userId: string, invitationId: string, accept: boolean) {
    const invitation = this.store.invitations.get(invitationId);
    if (!invitation || invitation.targetUserId !== userId || invitation.status !== 'pending') throw new NotFoundException('Invitation not found');
    invitation.status = accept ? 'accepted' : 'declined';
    if (accept) this.store.setMembership(invitation.workspaceId, userId, invitation.role);
    this.audit(invitation.workspaceId, userId, userId, accept ? 'invitation.accepted' : 'invitation.declined', {});
    return { ok: true };
  }

  updateMember(actorId: string, workspaceId: string, targetId: string, dto: UpdateMemberDto) {
    const actor = this.requireRole(workspaceId, actorId, ['owner', 'admin']);
    const target = this.store.getMembership(workspaceId, targetId);
    if (!target) throw new NotFoundException('Membership not found');
    if (dto.role === 'owner' && actor.role !== 'owner') throw new ForbiddenException('Only owners can promote another owner');
    if (target.role === 'owner' && actor.role !== 'owner') throw new ForbiddenException('Only owners can change an owner role');
    this.ensureNotLastOwner(workspaceId, targetId, dto.role);
    target.role = dto.role;
    this.audit(workspaceId, actorId, targetId, 'member.role_changed', { role: dto.role });
    return target;
  }

  removeMember(actorId: string, workspaceId: string, targetId: string) {
    const actor = this.requireRole(workspaceId, actorId, ['owner', 'admin', 'editor', 'viewer']);
    const target = this.store.getMembership(workspaceId, targetId);
    if (!target) throw new NotFoundException('Membership not found');
    const isSelf = actorId === targetId;
    if (!isSelf && !['owner', 'admin'].includes(actor.role)) throw new ForbiddenException('Cannot remove this member');
    if (target.role === 'owner' && actor.role !== 'owner') throw new ForbiddenException('Only owners can remove an owner');
    this.ensureNotLastOwner(workspaceId, targetId, 'viewer', true);
    this.store.memberships.delete(this.store.membershipKey(workspaceId, targetId));
    this.audit(workspaceId, actorId, targetId, isSelf ? 'member.left' : 'member.removed', {});
    return { ok: true };
  }

  requireRole(workspaceId: string, userId: string, allowed: WorkspaceRole[]) {
    this.store.requireWorkspace(workspaceId);
    const membership = this.store.getMembership(workspaceId, userId);
    if (!membership || !allowed.includes(membership.role)) throw new ForbiddenException('Workspace access denied');
    return membership;
  }

  private ensureNotLastOwner(workspaceId: string, targetId: string, nextRole: WorkspaceRole, removing = false) {
    const target = this.store.getMembership(workspaceId, targetId);
    if (target?.role !== 'owner' || (!removing && nextRole === 'owner')) return;
    const owners = [...this.store.memberships.values()].filter((item) => item.workspaceId === workspaceId && item.role === 'owner');
    if (owners.length <= 1) throw new ConflictException('Workspace must keep at least one owner');
  }

  private audit(workspaceId: string, actorUserId: string, targetUserId: string | undefined, action: string, changeSummary: object) {
    this.store.workspaceAudit.push({ id: randomUUID(), workspaceId, actorUserId, targetUserId, action, changeSummary, createdAt: new Date() });
  }
}
