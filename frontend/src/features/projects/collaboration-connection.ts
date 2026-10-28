import { createClient } from '@liveblocks/client';
import { LiveblocksYjsProvider } from '@liveblocks/yjs';
import { Y } from '@context-flow/collaboration';
import { api } from '@/lib/api/client';
import { parseCursor, readParticipants, type CanvasCursor, type CanvasParticipant } from './canvas-presence';

export type SyncState = 'connecting' | 'synced' | 'syncing' | 'offline' | 'error';
export async function connectCanvas(projectId: string, callbacks: {
  ready: (doc: Y.Doc) => void;
  status: (state: SyncState, others: number) => void;
  presence?: (participants: CanvasParticipant[]) => void;
}) {
  const client = createClient({
    authEndpoint: async () => api<{ token: string }>(`/projects/${projectId}/collaboration/auth`, { method: 'POST' }),
    throttle: 50,
    preventUnsavedChanges: true,
  });
  const { room, leave } = client.enterRoom(`contextflow:project:${projectId}`, { initialPresence: { cursor: null } });
  const doc = new Y.Doc();
  const provider = new LiveblocksYjsProvider(room, doc);
  let ready = false;
  let error = false;
  let cursor: CanvasCursor | null = null;
  const updateCursor = (value: CanvasCursor | null) => {
    cursor = parseCursor(value);
    if (room.getStatus() === 'connected') room.updatePresence({ cursor });
  };
  const update = () => {
    if (provider.synced && !ready) { ready = true; callbacks.ready(doc); }
    const status = room.getStatus();
    callbacks.presence?.(!error && status === 'connected' ? readParticipants(room.getOthers()) : []);
    callbacks.status(error ? 'error' : status === 'connected'
      ? provider.getStatus() === 'synchronized' ? 'synced' : 'syncing'
      : ready ? 'offline' : 'connecting', room.getOthers().length);
  };
  const onError = () => { error = true; update(); };
  const cleanups = [room.subscribe('status', () => { error = false; if (room.getStatus() === 'connected') room.updatePresence({ cursor }); update(); }), room.subscribe('others', update), room.subscribe('error', onError)];
  provider.on('sync', update);
  provider.on('status', update);
  update();
  return Object.assign(() => {
    if (room.getStatus() === 'connected') room.updatePresence({ cursor: null });
    callbacks.presence?.([]);
    for (const cleanup of cleanups) cleanup();
    provider.off('sync', update);
    provider.off('status', update);
    provider.destroy();
    leave();
    doc.destroy();
  }, { updateCursor });
}
