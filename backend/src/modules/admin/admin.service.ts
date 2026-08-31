import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppStore } from '../../db/app-store.js';

@Injectable()
export class AdminService {
  constructor(private readonly store: AppStore) {}

  listUsers() {
    return [...this.store.users.values()].map((user) => ({
      ...this.store.publicUser(user),
      workspaceCount: this.store.listUserWorkspaces(user.id).length,
      projectCount: [...this.store.projects.values()].filter((project) => Boolean(this.store.getMembership(project.workspaceId, user.id))).length,
    }));
  }

  setStatus(actorId: string, targetId: string, status: 'active' | 'suspended') {
    if (actorId === targetId && status === 'suspended') throw new ForbiddenException('You cannot suspend your own account');
    const target = this.store.requireUser(targetId);
    if (target.role === 'admin' && status === 'suspended') this.ensureAnotherActiveAdmin(targetId);
    target.status = status;
    if (status === 'suspended') this.revokeSessions(targetId);
    this.audit(actorId, targetId, 'user.status_changed', { status });
    return this.store.publicUser(target);
  }

  setRole(actorId: string, targetId: string, role: 'user' | 'admin') {
    const target = this.store.requireUser(targetId);
    if (target.role === 'admin' && role === 'user') this.ensureAnotherActiveAdmin(targetId);
    target.role = role;
    target.tokenVersion += 1;
    this.revokeSessions(targetId);
    this.audit(actorId, targetId, 'user.role_changed', { role });
    return this.store.publicUser(target);
  }

  revokeSessions(targetId: string) {
    for (const session of this.store.sessions.values()) if (session.userId === targetId) session.revokedAt = new Date();
    return { ok: true };
  }

  createPasswordReset(actorId: string, targetId: string) {
    this.store.requireUser(targetId);
    const resetCode = randomBytes(24).toString('base64url');
    const record = {
      id: randomUUID(),
      userId: targetId,
      issuedByAdminId: actorId,
      tokenHash: createHash('sha256').update(resetCode).digest('hex'),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
    this.store.passwordResets.set(record.id, record);
    this.audit(actorId, targetId, 'user.password_reset_issued', { expiresAt: record.expiresAt });
    return { resetCode, expiresAt: record.expiresAt, warning: 'This code is shown once. Share it with the verified account owner through a trusted channel.' };
  }

  auditLogs() {
    return [...this.store.adminAudit].reverse();
  }

  private ensureAnotherActiveAdmin(excludedId: string) {
    const count = [...this.store.users.values()].filter((user) => user.id !== excludedId && user.role === 'admin' && user.status === 'active').length;
    if (!count) throw new ConflictException('The system must keep at least one active administrator');
  }

  private audit(actorUserId: string, targetUserId: string, action: string, changeSummary: object) {
    this.store.adminAudit.push({ id: randomUUID(), actorUserId, targetUserId, action, changeSummary, createdAt: new Date() });
  }
}
