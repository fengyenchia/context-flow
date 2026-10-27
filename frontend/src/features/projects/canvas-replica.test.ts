import { describe, it, expect } from 'vitest';
import { Y, cloneDoc, readSnapshot, seedDocument, patchSnapshot, type Snapshot } from '@context-flow/collaboration';
import { CanvasReplica } from './canvas-replica';

const original: Snapshot = {
  nodes: [
    { id: 'a', position: { x: 0, y: 0 }, data: { nodeTitle: '標題', nodeContent: '原文', nodeColor: 'pink' }, style: { background: 'pink' } },
    { id: 'b', position: { x: 200, y: 0 }, data: { nodeTitle: '第二個', nodeContent: '資料' } },
  ],
  edges: [{ id: 'ab', source: 'a', target: 'b', label: '關係' }],
  convergenceNodes: [{ id: 'c', position: { x: 0, y: 0 }, data: { nodeTitle: '結論' } }],
  resources: [{ id: 'r', title: '資料池', content: '來源' }], conversations: { general: ['使用者：開始'] },
};
function clients() {
  const seed = seedDocument(original);
  const a = cloneDoc(seed); const b = cloneDoc(seed);
  const first = new CanvasReplica(a, () => {}); const second = new CanvasReplica(b, () => {});
  return { a, b, first, second, merge: () => { const av = Y.encodeStateAsUpdate(a); const bv = Y.encodeStateAsUpdate(b); Y.applyUpdate(a, bv); Y.applyUpdate(b, av); expect(readSnapshot(a)).toEqual(readSnapshot(b)); return readSnapshot(a); } };
}
describe('canvas CRDT replicas', () => {
  it('merges simultaneous different nodes, positions, colors, edge labels and all three areas', () => {
    const { a, b, first, second, merge } = clients();
    const left = readSnapshot(a); const right = readSnapshot(b);
    left.nodes[0].position = { x: 60, y: 70 };
    left.edges[0].label = '新的關係';
    left.resources![0].content = '新來源';
    right.nodes[0].data = { ...right.nodes[0].data as object, nodeColor: 'blue' };
    right.nodes[1].data = { ...right.nodes[1].data as object, nodeTitle: '更新第二個' };
    right.convergenceNodes![0].data = { nodeTitle: '新結論' };
    first.publish(left); second.publish(right);
    const result = merge();
    expect(result.nodes[0]).toMatchObject({ position: { x: 60, y: 70 }, data: { nodeColor: 'blue' } });
    expect(result.edges[0].label).toBe('新的關係');
    expect(result.resources![0].content).toBe('新來源');
    expect(result.convergenceNodes![0].data).toEqual({ nodeTitle: '新結論' });
  });
  it('merges two open text dialogs even when one receives a remote edit before saving', () => {
    const { a, b, first, second, merge } = clients();
    first.captureDraft('a'); second.captureDraft('a');
    first.saveDraft({ id: 'a', title: '標題', content: '甲原文', color: 'pink' });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    second.saveDraft({ id: 'a', title: '標題', content: '原文乙', color: 'pink' });
    expect((merge().nodes[0].data as Record<string, string>).nodeContent).toBe('甲原文乙');
  });
  it('does not undo remote color or title when an unchanged stale dialog is saved', () => {
    const { a, b, first, second, merge } = clients();
    first.captureDraft('a'); second.captureDraft('a');
    first.saveDraft({ id: 'a', title: '新標題', content: '原文', color: 'blue' });
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    second.saveDraft({ id: 'a', title: '標題', content: '原文乙', color: 'pink' });
    expect(merge().nodes[0]).toMatchObject({ data: { nodeTitle: '新標題', nodeContent: '原文乙', nodeColor: 'blue' } });
  });
  it('preserves disjoint edits at multiple positions in one text instead of reinserting unchanged characters', () => {
    const seed = seedDocument({ nodes: [{ id: 'text', data: { nodeContent: 'abcdef' } }], edges: [] });
    const a = cloneDoc(seed); const b = cloneDoc(seed);
    const first = new CanvasReplica(a, () => {}); const second = new CanvasReplica(b, () => {});
    first.captureDraft('text'); second.captureDraft('text');
    first.saveDraft({ id: 'text', content: 'AbcdeF' });
    second.saveDraft({ id: 'text', content: 'abCDef' });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect((readSnapshot(a).nodes[0].data as Record<string, string>).nodeContent).toBe('AbCDeF');
  });
  it('keeps concurrent additions, deletions and chat messages after offline reconnection', () => {
    const { a, b, first, second, merge } = clients();
    const left = readSnapshot(a); const right = readSnapshot(b);
    left.nodes = left.nodes.filter(item => item.id !== 'a');
    left.nodes.push({ id: 'new-a', position: { x: 1, y: 1 } });
    right.nodes.push({ id: 'new-b', position: { x: 2, y: 2 } });
    right.edges.push({ id: 'new-edge', source: 'a', target: 'new-b' });
    left.conversations!.general.push('使用者：甲'); right.conversations!.general.push('使用者：乙');
    first.publish(left); second.publish(right);
    const result = merge();
    expect(result.nodes.map(item => item.id)).toEqual(['b', 'new-a', 'new-b']);
    expect(result.edges).toEqual([]);
    expect(result.conversations!.general).toEqual(expect.arrayContaining(['使用者：甲', '使用者：乙']));
    const restored = cloneDoc(a);
    expect(readSnapshot(restored)).toEqual(result);
    // Duplicate and out-of-order replay remains idempotent after a restart.
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(b));
    expect(readSnapshot(restored)).toEqual(result);
  });
  it('imports the same legacy snapshot only once when first opens race', () => {
    const one = seedDocument(original); const two = seedDocument(original);
    expect(Y.encodeStateAsUpdate(one)).toEqual(Y.encodeStateAsUpdate(two));
    const reordered = seedDocument({ ...original, nodes: [...original.nodes].reverse() });
    expect(Y.encodeStateAsUpdate(one)).toEqual(Y.encodeStateAsUpdate(reordered));
    Y.applyUpdate(one, Y.encodeStateAsUpdate(two));
    expect(readSnapshot(one)).toEqual(originalWithDefaults());
  });
  it('does not serialize local selections or React labels', () => {
    const doc = new Y.Doc();
    patchSnapshot(doc, { nodes: [], edges: [] }, { nodes: [{ id: 'a', selected: true, measured: { width: 99 }, data: { label: { react: true }, nodeTitle: '保留' } }], edges: [] });
    expect(readSnapshot(doc).nodes[0]).toEqual({ id: 'a', data: { nodeTitle: '保留' } });
  });
});
function originalWithDefaults() { return { convergenceEdges: [], summary: '', ...original }; }
