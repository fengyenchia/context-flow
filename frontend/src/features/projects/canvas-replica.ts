import { Y, cloneDoc, commitBranch, readSnapshot, type Snapshot } from '@context-flow/collaboration';

/** Keeps a branch of the last rendered state: remote updates never become local deletions. */
export class CanvasReplica {
  private base: Y.Doc;
  private actor: number;
  private view: Snapshot;
  private draft?: { doc: Y.Doc; snapshot: Snapshot; id: string; edge: boolean };
  private readonly receive = (_update: Uint8Array, origin: unknown) => {
    if (origin === 'local') return;
    this.refresh();
    this.onRemote(this.view);
  };
  constructor(readonly doc: Y.Doc, private onRemote: (snapshot: Snapshot) => void) {
    this.base = cloneDoc(doc);
    this.actor = this.base.clientID;
    this.view = readSnapshot(doc);
    doc.on('update', this.receive);
  }
  private refresh() {
    this.base.destroy();
    this.base = cloneDoc(this.doc);
    this.base.clientID = this.actor;
    this.view = readSnapshot(this.doc);
  }
  publish(next: Snapshot) {
    // The branch already contains this delta. Keep its stable actor/clock while
    // dragging instead of cloning the entire (possibly image-heavy) document.
    if (commitBranch(this.doc, this.base, this.view, next)) this.view = readSnapshot(this.doc);
  }
  captureDraft(id: string, edge = false) {
    this.draft?.doc.destroy();
    this.draft = { doc: cloneDoc(this.doc), snapshot: readSnapshot(this.doc), id, edge };
  }
  saveDraft(fields: { id: string; title?: string; content?: string; kind?: string; imageUrl?: string; color?: string; label?: string }) {
    const draft = this.draft;
    if (!draft || draft.id !== fields.id) return;
    const next = structuredClone(draft.snapshot);
    const collection = draft.edge
      ? (draft.snapshot.convergenceEdges?.some(item => item.id === fields.id) ? 'convergenceEdges' : 'edges')
      : (draft.snapshot.convergenceNodes?.some(item => item.id === fields.id) ? 'convergenceNodes' : 'nodes');
    const item = next[collection]?.find(item => item.id === fields.id);
    if (item) {
      if (draft.edge) item.label = fields.label;
      else {
        item.data = { ...item.data as object, nodeTitle: fields.title, nodeContent: fields.content, nodeKind: fields.kind, imageUrl: fields.imageUrl, nodeColor: fields.color };
        item.style = { ...item.style as object, background: fields.color };
        if (fields.color && /^#[0-9a-f]{6}$/i.test(fields.color)) (item.style as Record<string, unknown>).color = '#20201e';
      }
      commitBranch(this.doc, draft.doc, draft.snapshot, next);
    }
    draft.doc.destroy();
    this.draft = undefined;
    this.refresh();
    this.onRemote(this.view);
  }
  destroy() {
    this.doc.off('update', this.receive);
    this.base.destroy();
    this.draft?.doc.destroy();
  }
}
