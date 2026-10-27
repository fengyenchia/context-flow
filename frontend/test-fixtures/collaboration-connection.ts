import { Y } from '@context-flow/collaboration';
import { api } from '../src/lib/api/client';
import type { SyncState } from '../src/features/projects/collaboration-connection';

/** Local WebSocket fixture; selected by webpack only in the isolated E2E dev server. */
export async function connectCanvas(projectId: string, callbacks: {
  ready: (doc: Y.Doc) => void;
  status: (state: SyncState, others: number) => void;
}) {
  await api(`/projects/${projectId}/collaboration/auth`, { method: 'POST' });
  const doc = new Y.Doc();
  let socket: WebSocket;
  let ready = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout>;
  const connect = () => {
    if (closed) return;
    socket = new WebSocket(`ws://127.0.0.1:3100/__test-collaboration/${projectId}`);
    socket.onmessage = event => {
      Y.applyUpdate(doc, new Uint8Array(JSON.parse(event.data).update), 'remote');
      if (!ready) { ready = true; callbacks.ready(doc); }
      // State-vector exchange retransmits offline edits, not an old snapshot.
      if (event.data.includes('"hello":true')) socket.send(JSON.stringify({ update: [...Y.encodeStateAsUpdate(doc)] }));
      callbacks.status('synced', 1);
    };
    socket.onclose = () => { if (!closed) { callbacks.status('offline', 0); timer = setTimeout(connect, 300); } };
  };
  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'local') return;
    callbacks.status(socket.readyState === WebSocket.OPEN ? 'syncing' : 'offline', 1);
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ update: [...update] }));
  });
  callbacks.status('connecting', 0); connect();
  return () => { closed = true; clearTimeout(timer); socket.close(); doc.destroy(); };
}
