import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/client';
import { MemoryState } from './state';
import { captureBaseline, persistChanges } from './persistence';
import * as tables from '../src/db/schema';

vi.mock('../src/db/client', async () => {
  const { drizzle } = await import('drizzle-orm/neon-http');
  return { db: drizzle.mock() };
});

describe('normalized persistence safety', () => {
  it('does not overwrite password or status during a concurrent login timestamp update', async () => {
    const state = new MemoryState();
    const user = state.createUser({
      username: 'concurrent',
      displayName: 'Concurrent',
      passwordHash: 'must-not-overwrite',
    });
    const baseline = captureBaseline(state);
    user.lastLoginAt = new Date();
    const batch = vi.spyOn(db!, 'batch').mockResolvedValue([] as never);
    await persistChanges(state, baseline);
    const queries = batch.mock.calls[0][0] as unknown as Array<{
      toSQL(): { sql: string; params: unknown[] };
    }>;
    expect(queries).toHaveLength(1);
    expect(queries[0].toSQL().sql).toMatch(/^update/i);
    expect(queries[0].toSQL().sql).not.toContain('password_hash');
    expect(queries[0].toSQL().sql).not.toContain('"status"');
  });
  beforeEach(() => vi.restoreAllMocks());

  it('does not write on an unchanged read request', async () => {
    const state = new MemoryState();
    const batch = vi.spyOn(db!, 'batch').mockResolvedValue([] as never);
    await persistChanges(state, captureBaseline(state));
    expect(batch).not.toHaveBeenCalled();
  });

  it('writes parents and memberships with upserts in a single batch, with no global deletes', async () => {
    const state = new MemoryState();
    const baseline = captureBaseline(state);
    state.createUser({
      username: 'persisted',
      displayName: 'Persisted',
      passwordHash: 'test-hash',
    });
    const batch = vi.spyOn(db!, 'batch').mockResolvedValue([] as never);
    await persistChanges(state, baseline);
    expect(batch).toHaveBeenCalledTimes(1);
    const queries = batch.mock.calls[0][0] as unknown as Array<{
      toSQL(): { sql: string };
    }>;
    expect(queries).toHaveLength(3);
    for (const query of queries)
      expect(query.toSQL().sql).toMatch(/on conflict/i);
    expect(
      queries.some((query) => /delete from/i.test(query.toSQL().sql)),
    ).toBe(false);
  });

  it('replaces only the changed project and propagates transaction failures', async () => {
    const state = new MemoryState();
    state.canvasSnapshots.set('project-a', {
      nodes: [],
      edges: [],
      updatedAt: new Date(),
    });
    state.canvasSnapshots.set('project-b', {
      nodes: [],
      edges: [],
      updatedAt: new Date(),
    });
    const baseline = captureBaseline(state);
    state.canvasSnapshots.get('project-a')!.summary = 'Changed';
    const batch = vi.spyOn(db!, 'batch').mockResolvedValue([] as never);
    await persistChanges(state, baseline);
    const queries = batch.mock.calls[0][0] as unknown as Array<{
      toSQL?: () => { sql: string; params: unknown[] };
      getQuery?: () => { sql: string; params: unknown[] };
    }>;
    const deletes = queries
      .map((query) => (query.toSQL ? query.toSQL() : query.getQuery!()))
      .filter((query) => /delete from/i.test(query.sql));
    expect(deletes).toHaveLength(5);
    for (const query of deletes) {
      expect(query.sql).toContain('where');
      expect(query.params).toContain('project-a');
      expect(query.params).not.toContain('project-b');
    }
    batch.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(persistChanges(state, baseline)).rejects.toThrow(
      'database unavailable',
    );
    batch.mockRejectedValueOnce({ cause: { code: '22012' } });
    await expect(persistChanges(state, baseline)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rehydrates verification tokens, node colors, edges and ordered messages in a fresh store', async () => {
    const date = new Date('2026-10-23T00:00:00Z');
    const rows = new Map<unknown, unknown[]>([
      [
        tables.users,
        [
          {
            id: 'user',
            username: 'persisted',
            passwordHash: 'hash',
            displayName: 'Persisted',
            role: 'user',
            status: 'active',
            tokenVersion: 1,
            createdAt: date,
          },
        ],
      ],
      [
        tables.workspaces,
        [
          {
            id: 'workspace',
            name: 'Personal',
            kind: 'personal',
            createdByUserId: 'user',
            createdAt: date,
          },
        ],
      ],
      [
        tables.workspaceMembers,
        [
          {
            workspaceId: 'workspace',
            userId: 'user',
            role: 'owner',
            joinedAt: date,
          },
        ],
      ],
      [
        tables.emailVerificationTokens,
        [
          {
            id: 'verification',
            userId: 'user',
            tokenHash: 'hash',
            expiresAt: date,
            consumedAt: null,
          },
        ],
      ],
      [
        tables.canvasNodes,
        [
          {
            id: 'db-node',
            projectId: 'project',
            zone: 'zone',
            mediaType: 'text',
            title: 'Node',
            content: 'Content',
            positionX: 5,
            positionY: 10,
            updatedAt: date,
            groundingSource: { id: 'node', style: { background: '#e8f5ee' } },
          },
        ],
      ],
      [
        tables.canvasEdges,
        [
          {
            projectId: 'project',
            zone: 'zone',
            payload: { id: 'edge', source: 'node', target: 'other' },
          },
        ],
      ],
      [
        tables.canvasMessages,
        [
          {
            projectId: 'project',
            threadKey: 'general',
            sequence: 0,
            content: 'first',
          },
          {
            projectId: 'project',
            threadKey: 'general',
            sequence: 1,
            content: 'second',
          },
        ],
      ],
    ]);
    vi.spyOn(db!, 'select').mockImplementation(
      () =>
        ({
          from: (table: unknown) =>
            Object.assign(Promise.resolve(rows.get(table) || []), {
              orderBy: () => Promise.resolve(rows.get(table) || []),
            }),
        }) as never,
    );
    const fresh = new MemoryState();
    await fresh.hydrate();
    expect(fresh.emailVerifications.get('verification')?.tokenHash).toBe(
      'hash',
    );
    expect(fresh.canvasSnapshots.get('project')).toMatchObject({
      nodes: [
        {
          id: 'node',
          position: { x: 5, y: 10 },
          style: { background: '#e8f5ee' },
        },
      ],
      edges: [{ id: 'edge', source: 'node', target: 'other' }],
      conversations: { general: ['first', 'second'] },
    });
    const batch = vi.spyOn(db!, 'batch').mockResolvedValue([] as never);
    await fresh.persist();
    expect(batch).not.toHaveBeenCalled();
  });
});
