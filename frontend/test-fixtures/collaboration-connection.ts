import { Y } from '@context-flow/collaboration';
import { api } from '../src/lib/api/client';
import type { SyncState } from '../src/features/projects/collaboration-connection';
import { readParticipants, type CanvasCursor, type CanvasParticipant } from '../src/features/projects/canvas-presence';

/** Local WebSocket fixture; selected by webpack only in the isolated E2E dev server. */
export async function connectCanvas(projectId: string, callbacks: {
  ready: (doc: Y.Doc) => void;
  status: (state: SyncState, others: number) => void;
  presence?: (participants: CanvasParticipant[]) => void;
}) {
  const auth = await api<{ token: string }>(`/projects/${projectId}/collaboration/auth`, { method: 'POST' });
  const doc = new Y.Doc();
  let socket: WebSocket;
  let ready = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout>;
  let cursor: CanvasCursor | null = null;
  const updateCursor = (value: CanvasCursor | null) => {
    cursor = value;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ presence: { connectionId: doc.clientID, id: auth.token, info: { name: auth.token.startsWith('fixture-') ? auth.token.slice(8) : '協作者' }, presence: { cursor } } }));
  };
  const connect = () => {
    if (closed) return;
    socket = new WebSocket(`ws://127.0.0.1:3100/__test-collaboration/${projectId}`);
    socket.onmessage = event => {
      const payload = JSON.parse(event.data);
      if (Array.isArray(payload.participants)) { callbacks.presence?.(readParticipants(payload.participants)); return; }
      if (!Array.isArray(payload.update)) return;
      Y.applyUpdate(doc, new Uint8Array(payload.update), 'remote');
      if (!ready) { ready = true; callbacks.ready(doc); }
      // State-vector exchange retransmits offline edits, not an old snapshot.
      if (payload.hello) { socket.send(JSON.stringify({ update: [...Y.encodeStateAsUpdate(doc)] })); updateCursor(cursor); }
      callbacks.status('synced', 1);
    };
    socket.onclose = () => { callbacks.presence?.([]); if (!closed) { callbacks.status('offline', 0); timer = setTimeout(connect, 300); } };
  };
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'local') return;
    callbacks.status(socket.readyState === WebSocket.OPEN ? 'syncing' : 'offline', 1);
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ update: [...update] }));
  });
  callbacks.status('connecting', 0); connect();
  return Object.assign(() => { updateCursor(null); callbacks.presence?.([]); closed = true; clearTimeout(timer); socket.close(); doc.destroy(); }, { updateCursor });
}
