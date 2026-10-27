import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Y, seedDocument } from '@context-flow/collaboration';
import { connectCanvas } from './collaboration-connection';

const mocks = vi.hoisted(() => ({
  api: vi.fn(), enter: vi.fn(), leave: vi.fn(), create: vi.fn(),
  handlers: new Map<string, () => void>(), providerEvents: new Map<string, () => void>(),
  connection: 'connecting', sync: 'loading', synced: false, readyDoc: undefined as unknown,
  cleanup: vi.fn(),
}));
vi.mock('@/lib/api/client', () => ({ api: mocks.api }));
vi.mock('@liveblocks/client', () => ({ createClient: (config: unknown) => { mocks.create(config); return { enterRoom: mocks.enter }; } }));
vi.mock('@liveblocks/yjs', () => ({ LiveblocksYjsProvider: class {
  constructor(_room: unknown, doc: Y.Doc) { mocks.readyDoc = doc; }
  get synced() { return mocks.synced; }
  getStatus() { return mocks.sync; }
  on(event: string, callback: () => void) { mocks.providerEvents.set(event, callback); }
  off(event: string) { mocks.providerEvents.delete(event); }
  destroy() { mocks.cleanup(); }
} }));
beforeEach(() => {
  mocks.handlers.clear(); mocks.providerEvents.clear(); vi.clearAllMocks();
  mocks.connection = 'connecting'; mocks.sync = 'loading'; mocks.synced = false;
  mocks.api.mockResolvedValue({ token: 'fixture-token' });
  mocks.enter.mockReturnValue({ room: {
    getStatus: () => mocks.connection,
    getOthers: () => [{ id: 'other' }],
    subscribe: (name: string, handler: () => void) => { mocks.handlers.set(name, handler); return () => mocks.handlers.delete(name); },
  }, leave: mocks.leave });
});
describe('official Liveblocks connection adapter', () => {
  it('authorizes only the requested project and does not report saved before the provider acknowledges it', async () => {
    const ready = vi.fn(); const status = vi.fn();
    const cleanup = await connectCanvas('project-one', { ready, status });
    expect(mocks.enter).toHaveBeenCalledWith('contextflow:project:project-one');
    const options = mocks.create.mock.calls[0][0] as { authEndpoint: () => Promise<unknown> };
    await options.authEndpoint();
    expect(mocks.api).toHaveBeenCalledWith('/projects/project-one/collaboration/auth', { method: 'POST' });
    expect(status).toHaveBeenLastCalledWith('connecting', 1);
    const doc = mocks.readyDoc as Y.Doc;
    const seeded = seedDocument({ nodes: [], edges: [] });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seeded));
    mocks.connection = 'connected'; mocks.synced = true; mocks.sync = 'synchronizing';
    mocks.providerEvents.get('sync')!();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenLastCalledWith('syncing', 1);
    mocks.sync = 'synchronized'; mocks.providerEvents.get('status')!();
    expect(status).toHaveBeenLastCalledWith('synced', 1);
    mocks.connection = 'reconnecting'; mocks.handlers.get('status')!();
    expect(status).toHaveBeenLastCalledWith('offline', 1);
    cleanup();
    expect(mocks.cleanup).toHaveBeenCalledTimes(1); expect(mocks.leave).toHaveBeenCalledTimes(1);
    expect(mocks.handlers.size).toBe(0);
  });
  it('reports authorization or transport errors without pretending that local content is saved', async () => {
    const status = vi.fn(); const cleanup = await connectCanvas('p', { ready: vi.fn(), status });
    mocks.handlers.get('error')!();
    expect(status).toHaveBeenLastCalledWith('error', 1); cleanup();
  });
});
