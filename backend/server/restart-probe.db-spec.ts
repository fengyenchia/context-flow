import { expect, it } from 'vitest';
import { MemoryState } from './state';

// Only launched by restart.db-spec.ts after its transaction has committed.
it.skipIf(!process.env.DB_RESTART_PROBE)(
  'reads committed canvas data in an independent process',
  async () => {
    const expected = JSON.parse(process.env.DB_RESTART_PROBE!) as {
      userId: string;
      projectId: string;
      tokenId: string;
      parentPid: number;
    };
    expect(process.pid).not.toBe(expected.parentPid);
    const restored = new MemoryState();
    await restored.hydrate();
    expect(restored.users.get(expected.userId)?.displayName).toBe('DB test');
    const snapshot = restored.canvasSnapshots.get(expected.projectId)!;
    expect(snapshot.summary).toBe('First');
    expect(snapshot.nodes).toHaveLength(3);
    expect(snapshot.nodes[0]).toMatchObject({
      id: 'node-a',
      position: { x: -10, y: 20 },
      style: { background: '#e8f5ee' },
    });
    expect(snapshot.nodes[2]).toMatchObject({
      data: {
        imageUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO4oxHwHwAFjAJU5cX1yAAAAABJRU5ErkJggg==',
      },
    });
    expect(snapshot.edges[0]).toMatchObject({
      label: '包含',
      style: { stroke: '#d97887' },
    });
    expect(snapshot.convergenceNodes).toHaveLength(2);
    expect(snapshot.convergenceEdges?.[0]).toMatchObject({
      source: 'converge-a',
      target: 'converge-b',
      label: '驗證',
    });
    expect(snapshot.resources?.[0]).toMatchObject({ content: '內容' });
    expect(snapshot.conversations).toEqual({ general: ['第一句', '第二句'] });
    expect(restored.emailVerifications.has(expected.tokenId)).toBe(true);
  },
);
