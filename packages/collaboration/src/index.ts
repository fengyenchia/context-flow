import * as Y from 'yjs';
import diff from 'fast-diff';
export { Y };

export type Snapshot = {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  convergenceNodes?: Record<string, unknown>[];
  convergenceEdges?: Record<string, unknown>[];
  resources?: Record<string, unknown>[];
  conversations?: Record<string, string[]>;
  summary?: string;
};
const collections = ['nodes', 'edges', 'convergenceNodes', 'convergenceEdges', 'resources'] as const;
type Collection = typeof collections[number];
type Flat = Record<string, unknown>;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const key = (parts: string[]) => JSON.stringify(parts);
const textField = (path: string[]) => ['nodeTitle', 'nodeContent', 'content', 'label', 'title', 'summary'].includes(path.at(-1)!);

function flatten(value: Record<string, unknown>, path: string[] = [], out: Flat = {}): Flat {
  for (const [name, item] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    // React labels, selection and measurements are local UI state, never shared.
    if (item === undefined || (path.length === 0 && ['selected', 'dragging', 'measured', 'width', 'height'].includes(name)) || (path[0] === 'data' && name === 'label')) continue;
    const next = [...path, name];
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item as Record<string, unknown>, next, out);
    else out[key(next)] = item;
  }
  return out;
}

function writeText(text: Y.Text, value: string) {
  let offset = 0;
  for (const [operation, content] of diff(text.toString(), value)) {
    if (operation === diff.DELETE) text.delete(offset, content.length);
    else if (operation === diff.INSERT) { text.insert(offset, content); offset += content.length; }
    else offset += content.length;
  }
}

function patchFields(doc: Y.Doc, scope: string[], before: Flat, after: Flat) {
  const fields = doc.getMap('fields');
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (equal(before[path], after[path])) continue;
    const segments = JSON.parse(path) as string[];
    const id = key([...scope, ...segments]);
    if (!(path in after)) fields.delete(id);
    else if (scope[0] === 'meta' && segments[0] === 'conversations' && Array.isArray(after[path])) {
      fields.set(id, { array: true });
      const list = doc.getArray(id);
      const old = list.toArray();
      const next = after[path] as unknown[];
      let prefix = 0;
      while (prefix < old.length && prefix < next.length && equal(old[prefix], next[prefix])) prefix++;
      let suffix = 0;
      while (suffix < old.length - prefix && suffix < next.length - prefix && equal(old[old.length - 1 - suffix], next[next.length - 1 - suffix])) suffix++;
      if (old.length - prefix - suffix) list.delete(prefix, old.length - prefix - suffix);
      list.insert(prefix, next.slice(prefix, next.length - suffix));
    }
    else if (typeof after[path] === 'string' && textField(segments)) {
      fields.set(id, { text: true });
      writeText(doc.getText(id), after[path] as string);
    } else fields.set(id, after[path]);
  }
}

/** Apply only differences against the caller's own base, never replace a whole canvas. */
export function patchSnapshot(doc: Y.Doc, before: Snapshot, after: Snapshot) {
  doc.transact(() => {
    const entities = doc.getMap('entities');
    for (const collection of collections) {
      const old = new Map((before[collection] || []).map(item => [String(item.id), item]));
      const next = new Map((after[collection] || []).map(item => [String(item.id), item]));
      for (const id of old.keys()) if (!next.has(id)) entities.set(key([collection, id]), false);
      for (const [id, value] of next) {
        if (!old.has(id)) entities.set(key([collection, id]), true);
        patchFields(doc, [collection, id], flatten(old.get(id) || {}), flatten(value));
      }
    }
    patchFields(doc, ['meta'], flatten({ summary: before.summary || '', conversations: before.conversations || {} }), flatten({ summary: after.summary || '', conversations: after.conversations || {} }));
  });
}

export function readSnapshot(doc: Y.Doc): Snapshot {
  const result: Snapshot = { nodes: [], edges: [], convergenceNodes: [], convergenceEdges: [], resources: [], conversations: {}, summary: '' };
  const entities = doc.getMap('entities');
  const records = new Map<string, Record<string, unknown>>();
  const meta: Record<string, unknown> = {};
  for (const [id, exists] of entities) if (exists) records.set(id, {});
  for (const [id, raw] of doc.getMap('fields')) {
    const parts = JSON.parse(id) as string[];
    const target = parts[0] === 'meta' ? meta : records.get(key(parts.slice(0, 2)));
    if (!target) continue;
    let cursor = target;
    const path = parts.slice(parts[0] === 'meta' ? 1 : 2);
    for (const segment of path.slice(0, -1)) {
      // Defend against object prototype paths in untrusted shared content.
      if (['__proto__', 'constructor', 'prototype'].includes(segment)) throw new Error('Invalid shared field');
      if (!Object.hasOwn(cursor, segment)) cursor[segment] = {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    const name = path.at(-1)!;
    if (['__proto__', 'constructor', 'prototype'].includes(name)) continue;
    cursor[name] = raw && typeof raw === 'object' && 'text' in raw ? doc.getText(id).toString()
      : raw && typeof raw === 'object' && 'array' in raw ? doc.getArray(id).toArray() : raw;
  }
  for (const [id, value] of [...records].sort(([a], [b]) => a.localeCompare(b))) {
    const [collection] = JSON.parse(id) as [Collection, string];
    result[collection]!.push(value);
  }
  result.summary = String(meta.summary || '');
  result.conversations = (meta.conversations || {}) as Record<string, string[]>;
  // Deleting a node wins over a concurrent connection to it.
  for (const [nodes, edges] of [['nodes', 'edges'], ['convergenceNodes', 'convergenceEdges']] as const) {
    const ids = new Set(result[nodes]!.map(node => node.id));
    result[edges] = result[edges]!.filter(edge => ids.has(edge.source) && ids.has(edge.target));
  }
  return result;
}

export const emptySnapshot = (): Snapshot => ({ nodes: [], edges: [] });
export function cloneDoc(doc: Y.Doc) {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
}

/** Replay a local change on a captured branch, then CRDT-merge with remote edits. */
export function commitBranch(target: Y.Doc, base: Y.Doc, before: Snapshot, after: Snapshot) {
  const vector = Y.encodeStateVector(base);
  patchSnapshot(base, before, after);
  const update = Y.encodeStateAsUpdate(base, vector);
  if (update.length === 2 && update[0] === 0 && update[1] === 0) return false;
  Y.applyUpdate(target, update, 'local');
  return true;
}

/** Deterministic import makes simultaneous first-open requests idempotent. */
export function seedDocument(snapshot: Snapshot) {
  const doc = new Y.Doc();
  doc.clientID = 1;
  const sorted = { ...snapshot };
  for (const collection of collections) sorted[collection] = [...(snapshot[collection] || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  patchSnapshot(doc, emptySnapshot(), sorted);
  doc.getMap('meta').set('schema', 1);
  return doc;
}
