import { and, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '../src/db/client';
import * as tables from '../src/db/schema';
import { asDate, ApiProblem, type MemoryState } from './state';

export const collectionNames = [
  'users',
  'workspaces',
  'memberships',
  'projects',
  'projectLinks',
  'projectGrants',
  'invitations',
  'sessions',
  'credentials',
  'resets',
  'emailVerifications',
  'canvasSnapshots',
  'documents',
] as const;
export type Baseline = Record<
  (typeof collectionNames)[number],
  Map<string, string>
>;

export function captureBaseline(state: MemoryState): Baseline {
  return Object.fromEntries(
    collectionNames.map((name) => [
      name,
      new Map(
        [...state[name]].map(([id, value]) => [id, JSON.stringify(value)]),
      ),
    ]),
  ) as Baseline;
}

function changedFields<T extends object>(
  values: T,
  previous?: string,
): Partial<T> {
  if (!previous) return values;
  const old = JSON.parse(previous) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        key !== 'id' &&
        JSON.stringify(value ?? null) !== JSON.stringify(old[key] ?? null),
    ),
  ) as Partial<T>;
}

/** A single atomic batch contains only changes made by this request. */
export async function persistChanges(state: MemoryState, baseline: Baseline) {
  if (!db) return;
  const database = db;
  const queries: BatchItem<'pg'>[] = [];
  const changed = (name: keyof Baseline, id: string, value: unknown) =>
    baseline[name].get(id) !== JSON.stringify(value);
  for (const [id, user] of state.users)
    if (changed('users', id, user)) {
      const values = {
        ...user,
        email: user.email ?? null,
        emailVerifiedAt: asDate(user.emailVerifiedAt),
        lastLoginAt: asDate(user.lastLoginAt),
        createdAt: asDate(user.createdAt)!,
        updatedAt: new Date(),
      };
      queries.push(
        baseline.users.has(id)
          ? database
              .update(tables.users)
              .set(changedFields(values, baseline.users.get(id)))
              .where(eq(tables.users.id, id))
          : database
              .insert(tables.users)
              .values(values)
              .onConflictDoUpdate({ target: tables.users.id, set: values }),
      );
    }
  for (const [id, workspace] of state.workspaces)
    if (changed('workspaces', id, workspace)) {
      const values = {
        ...workspace,
        createdAt: asDate(workspace.createdAt)!,
        updatedAt: new Date(),
      };
      queries.push(
        database
          .insert(tables.workspaces)
          .values(values)
          .onConflictDoUpdate({
            target: tables.workspaces.id,
            set: changedFields(values, baseline.workspaces.get(id)),
          }),
      );
    }
  for (const [id, membership] of state.memberships)
    if (changed('memberships', id, membership)) {
      const values = { ...membership, joinedAt: asDate(membership.joinedAt)! };
      queries.push(
        baseline.memberships.has(id)
          ? database
              .update(tables.workspaceMembers)
              .set(changedFields(values, baseline.memberships.get(id)))
              .where(
                and(
                  eq(
                    tables.workspaceMembers.workspaceId,
                    membership.workspaceId,
                  ),
                  eq(tables.workspaceMembers.userId, membership.userId),
                ),
              )
          : database
              .insert(tables.workspaceMembers)
              .values(values)
              .onConflictDoNothing(),
      );
    }
  for (const [id, project] of state.projects)
    if (changed('projects', id, project)) {
      const values = {
        ...project,
        createdAt: asDate(project.createdAt)!,
        updatedAt: new Date(),
      };
      queries.push(
        baseline.projects.has(id)
          ? database
              .update(tables.projects)
              .set(changedFields(values, baseline.projects.get(id)))
              .where(eq(tables.projects.id, id))
          : database
              .insert(tables.projects)
              .values(values)
              .onConflictDoUpdate({ target: tables.projects.id, set: values }),
      );
    }
  for (const [id, link] of state.projectLinks)
    if (changed('projectLinks', id, link)) {
      const values = { ...link, expiresAt: asDate(link.expiresAt)!, revokedAt: asDate(link.revokedAt) };
      queries.push(baseline.projectLinks.has(id)
        ? database.update(tables.projectInviteLinks).set(changedFields(values, baseline.projectLinks.get(id))).where(eq(tables.projectInviteLinks.id, id))
        : database.insert(tables.projectInviteLinks).values(values));
    }
  for (const [id, grant] of state.projectGrants)
    if (changed('projectGrants', id, grant)) queries.push(database.insert(tables.projectInviteGrants).values(grant).onConflictDoNothing());
  for (const [id, invitation] of state.invitations)
    if (changed('invitations', id, invitation)) {
      const values = {
        ...invitation,
        createdAt: asDate(invitation.createdAt)!,
      };
      queries.push(
        database
          .insert(tables.workspaceInvitations)
          .values(values)
          .onConflictDoUpdate({
            target: tables.workspaceInvitations.id,
            set: values,
          }),
      );
    }
  for (const [id, session] of state.sessions)
    if (changed('sessions', id, session)) {
      const values = {
        ...session,
        expiresAt: asDate(session.expiresAt)!,
        revokedAt: asDate(session.revokedAt),
      };
      queries.push(
        database
          .insert(tables.refreshSessions)
          .values(values)
          .onConflictDoUpdate({
            target: tables.refreshSessions.id,
            set: values,
          }),
      );
    }
  for (const [userId, credential] of state.credentials)
    if (changed('credentials', userId, credential)) {
      const values = {
        userId,
        provider: 'gemini',
        encryptedApiKey: credential.encryptedApiKey,
        encryptionIv: credential.iv,
        authTag: credential.authTag,
        keyHint: credential.keyHint,
        lastValidatedAt: asDate(credential.lastValidatedAt),
        updatedAt: asDate(credential.updatedAt)!,
      };
      const previousCredential = baseline.credentials.get(userId);
      const oldCredential = previousCredential
        ? (JSON.parse(previousCredential) as Record<string, unknown>)
        : undefined;
      const previousValues = oldCredential
        ? JSON.stringify({
            ...oldCredential,
            encryptionIv: oldCredential.iv,
            provider: 'gemini',
          })
        : undefined;
      queries.push(
        previousCredential
          ? database
              .update(tables.aiCredentials)
              .set(changedFields(values, previousValues))
              .where(
                and(
                  eq(tables.aiCredentials.userId, userId),
                  eq(tables.aiCredentials.provider, 'gemini'),
                ),
              )
          : database
              .insert(tables.aiCredentials)
              .values(values)
              .onConflictDoUpdate({
                target: [
                  tables.aiCredentials.userId,
                  tables.aiCredentials.provider,
                ],
                set: values,
              }),
      );
    }
  for (const [name, table] of [
    ['resets', tables.passwordResetTokens],
    ['emailVerifications', tables.emailVerificationTokens],
  ] as const) {
    for (const [id, token] of state[name])
      if (changed(name, id, token)) {
        const values = {
          ...token,
          expiresAt: asDate(token.expiresAt)!,
          consumedAt: asDate(token.consumedAt),
        };
        queries.push(
          database
            .insert(table)
            .values(values)
            .onConflictDoUpdate({ target: table.id, set: values }),
        );
      }
  }
  for (const [id, document] of state.documents)
    if (changed('documents', id, document)) {
      queries.push(
        database
          .insert(tables.documents)
          .values(document)
          .onConflictDoUpdate({
            target: tables.documents.id,
            set: { ...document, updatedAt: new Date() },
          }),
      );
    }
  for (const [projectId, snapshot] of state.canvasSnapshots)
    if (changed('canvasSnapshots', projectId, snapshot)) {
      // Replacing this project's snapshot is atomic and cannot delete other projects.
      const previous = baseline.canvasSnapshots.get(projectId);
      const expected = previous
        ? (JSON.parse(previous) as { updatedAt: string }).updatedAt
        : null;
      queries.push(
        database.execute(
          sql`select pg_advisory_xact_lock(hashtext(${projectId}))`,
        ),
      );
      // The lock and revision check run in the same transaction as the replacement.
      queries.push(
        database.execute(
          sql`select 1 / ((not exists (select 1 from canvas_summaries where project_id = ${projectId}) or exists (select 1 from canvas_summaries where project_id = ${projectId} and date_trunc('milliseconds', updated_at) = ${expected ? new Date(expected).toISOString() : null}::timestamptz))::int)`,
        ),
      );
      for (const table of [
        tables.canvasNodes,
        tables.canvasEdges,
        tables.canvasMessages,
        tables.canvasResources,
        tables.canvasSummaries,
      ])
        queries.push(
          database.delete(table).where(eq(table.projectId, projectId)),
        );
      const nodes = [
        ...snapshot.nodes.map((node) => ({ node, zone: 'zone' })),
        ...(snapshot.convergenceNodes || []).map((node) => ({
          node,
          zone: 'converge',
        })),
      ].map(({ node, zone }) => {
        const item = node as Record<string, unknown>;
        const data = (item.data || {}) as Record<string, unknown>;
        const position = (item.position || {}) as Record<string, unknown>;
        return {
          projectId,
          zone,
          mediaType: String(data.nodeKind || 'text'),
          title: String(data.nodeTitle || '').slice(0, 255),
          content: String(data.nodeContent || ''),
          mediaUrl: data.imageUrl ? String(data.imageUrl) : null,
          positionX: Number(position.x) || 0,
          positionY: Number(position.y) || 0,
          groundingSource: item,
        };
      });
      if (nodes.length)
        queries.push(database.insert(tables.canvasNodes).values(nodes));
      const edges = [
        ...snapshot.edges.map((edge) => ({ edge, zone: 'zone' })),
        ...(snapshot.convergenceEdges || []).map((edge) => ({
          edge,
          zone: 'converge',
        })),
      ].map(({ edge, zone }) => {
        const item = edge as Record<string, unknown>;
        return {
          projectId,
          zone,
          sourceId: String(item.source || ''),
          targetId: String(item.target || ''),
          label: String(item.label || ''),
          payload: item,
        };
      });
      if (edges.length)
        queries.push(database.insert(tables.canvasEdges).values(edges));
      const resources = (snapshot.resources || []).map((resource) => {
        const item = resource as Record<string, unknown>;
        return {
          projectId,
          resourceKey: String(item.id || ''),
          kind: String(item.kind || 'text'),
          title: String(item.title || '').slice(0, 255),
          content: String(item.content || ''),
          url: item.url ? String(item.url) : null,
          contentHash: item.contentHash ? String(item.contentHash) : null,
        };
      });
      if (resources.length)
        queries.push(database.insert(tables.canvasResources).values(resources));
      const messages = Object.entries(snapshot.conversations || {}).flatMap(
        ([threadKey, contents]) =>
          contents.map((content, sequence) => ({
            projectId,
            threadKey,
            sequence,
            role: sequence % 2 ? 'assistant' : 'user',
            content,
          })),
      );
      if (messages.length)
        queries.push(database.insert(tables.canvasMessages).values(messages));
      queries.push(
        database.insert(tables.canvasSummaries).values({
          projectId,
          content: snapshot.summary || '',
          updatedAt: asDate(snapshot.updatedAt)!,
        }),
      );
    }
  // Deletes are bounded to records present in the request's baseline.
  for (const [name, table, column] of [
    ['projectGrants', tables.projectInviteGrants, tables.projectInviteGrants.id],
    ['projectLinks', tables.projectInviteLinks, tables.projectInviteLinks.id],
    ['documents', tables.documents, tables.documents.id],
    [
      'invitations',
      tables.workspaceInvitations,
      tables.workspaceInvitations.id,
    ],
    ['sessions', tables.refreshSessions, tables.refreshSessions.id],
    ['resets', tables.passwordResetTokens, tables.passwordResetTokens.id],
    [
      'emailVerifications',
      tables.emailVerificationTokens,
      tables.emailVerificationTokens.id,
    ],
    ['credentials', tables.aiCredentials, tables.aiCredentials.userId],
    ['projects', tables.projects, tables.projects.id],
    ['workspaces', tables.workspaces, tables.workspaces.id],
    ['users', tables.users, tables.users.id],
  ] as const)
    for (const id of baseline[name].keys())
      if (!state[name].has(id))
        queries.push(database.delete(table).where(eq(column, id)));
  for (const key of baseline.memberships.keys())
    if (!state.memberships.has(key)) {
      const [workspaceId, userId] = key.split(':');
      queries.push(
        database
          .delete(tables.workspaceMembers)
          .where(
            and(
              eq(tables.workspaceMembers.workspaceId, workspaceId),
              eq(tables.workspaceMembers.userId, userId),
            ),
          ),
      );
    }
  if (queries.length) {
    try {
      await database.batch(queries as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]);
    } catch (error) {
      const record = error as { code?: string; cause?: { code?: string } };
      if ((record.cause?.code || record.code) === '22012')
        throw new ApiProblem(
          409,
          '此畫布已被其他視窗更新，請先匯出本機 JSON，再重新載入',
        );
      throw error;
    }
  }
}
