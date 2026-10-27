import { createClient } from '@liveblocks/client';
import { LiveblocksYjsProvider } from '@liveblocks/yjs';
import { Y } from '@context-flow/collaboration';
import { api } from '@/lib/api/client';

export type SyncState = 'connecting' | 'synced' | 'syncing' | 'offline' | 'error';
export async function connectCanvas(projectId: string, callbacks: {
  ready: (doc: Y.Doc) => void;
  status: (state: SyncState, others: number) => void;
}) {
  const client = createClient({
    authEndpoint: async () => api<{ token: string }>(`/projects/${projectId}/collaboration/auth`, { method: 'POST' }),
    throttle: 50,
    preventUnsavedChanges: true,
  });
  const { room, leave } = client.enterRoom(`contextflow:project:${projectId}`);
  const doc = new Y.Doc();
  const provider = new LiveblocksYjsProvider(room, doc);
  let ready = false;
  let error = false;
  const update = () => {
    if (provider.synced && !ready) { ready = true; callbacks.ready(doc); }
    const status = room.getStatus();
    callbacks.status(error ? 'error' : status === 'connected'
      ? provider.getStatus() === 'synchronized' ? 'synced' : 'syncing'
      : ready ? 'offline' : 'connecting', room.getOthers().length);
  };
  const onError = () => { error = true; update(); };
  const cleanups = [room.subscribe('status', () => { error = false; update(); }), room.subscribe('others', update), room.subscribe('error', onError)];
  provider.on('sync', update);
  provider.on('status', update);
  update();
  return () => {
    for (const cleanup of cleanups) cleanup();
    provider.off('sync', update);
    provider.off('status', update);
    provider.destroy();
    leave();
    doc.destroy();
  };
}
