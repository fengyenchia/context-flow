import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db/client';
import { users, workspaces } from '../src/db/schema';
import { MemoryState } from './state';

const createdUsers: string[] = [], createdWorkspaces: string[] = [];
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  for (const id of createdWorkspaces) await db!.delete(workspaces).where(eq(workspaces.id, id));
  if (createdUsers.length) await db!.delete(users).where(inArray(users.id, createdUsers));
});
it('persists project-only access, role changes, expiry semantics and revocation across independent state reloads', async () => {
  vi.stubEnv('PROJECT_INVITES_ENABLED', 'true');
  const first = new MemoryState(); await first.hydrate(true);
  const suffix = randomUUID().slice(0, 8);
  const owner = first.createUser({ username: `invite-owner-${suffix}`, displayName: 'Owner', passwordHash: 'fixture' });
  const guest = first.createUser({ username: `invite-guest-${suffix}`, displayName: 'Guest', passwordHash: 'fixture' });
  createdUsers.push(owner.id, guest.id);
  const owned = [...first.workspaces.values()].filter(item => createdUsers.includes(item.createdByUserId));
  createdWorkspaces.push(...owned.map(item => item.id));
  const workspace = owned.find(item => item.createdByUserId === owner.id)!;
  const projectId = randomUUID(), linkId = randomUUID(), grantId = randomUUID();
  first.projects.set(projectId, { id: projectId, workspaceId: workspace.id, name: 'Invitation persistence fixture', description: '', layoutDirection: 'LR', createdByUserId: owner.id, createdAt: new Date() });
  first.projectLinks.set(linkId, { id: linkId, projectId, role: 'editor', tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'), expiresAt: new Date(Date.now() - 1000), createdAt: new Date(), createdByUserId: owner.id });
  first.projectGrants.set(grantId, { id: grantId, linkId, userId: guest.id, joinedAt: new Date() });
  await first.persist();
  const second = new MemoryState(); await second.hydrate(true);
  expect(second.member(workspace.id, guest.id)).toBeUndefined();
  expect(second.projectRole(projectId, guest.id)).toBe('editor');
  second.projectLinks.get(linkId)!.role = 'viewer'; await second.persist();
  const third = new MemoryState(); await third.hydrate(true);
  expect(third.projectRole(projectId, guest.id)).toBe('viewer');
  third.projectLinks.get(linkId)!.revokedAt = new Date(); await third.persist();
  const last = new MemoryState(); await last.hydrate(true);
  expect(last.projectRole(projectId, guest.id)).toBeUndefined();
  expect(last.projects.has(projectId)).toBe(true);
});
