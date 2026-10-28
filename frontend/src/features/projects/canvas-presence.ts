export type CursorArea = 'zone' | 'diverge' | 'converge';
export type CanvasCursor = { area: CursorArea; x: number; y: number };
export type CanvasParticipant = { connectionId: number; userId: string; name: string; cursor: CanvasCursor | null };

export function parseCursor(value: unknown): CanvasCursor | null {
  if (!value || typeof value !== 'object') return null;
  const cursor = value as Record<string, unknown>;
  if ((cursor.area !== 'zone' && cursor.area !== 'diverge' && cursor.area !== 'converge') || typeof cursor.x !== 'number' || typeof cursor.y !== 'number' || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y) || Math.abs(cursor.x) > 10_000_000 || Math.abs(cursor.y) > 10_000_000) return null;
  return { area: cursor.area, x: cursor.x, y: cursor.y };
}
export function readParticipants(values: readonly unknown[]): CanvasParticipant[] {
  return values.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const user = value as Record<string, unknown>;
    if (!Number.isSafeInteger(user.connectionId) || Number(user.connectionId) < 0) return [];
    const info = user.info && typeof user.info === 'object' ? user.info as Record<string, unknown> : {};
    const presence = user.presence && typeof user.presence === 'object' ? user.presence as Record<string, unknown> : {};
    return [{ connectionId: Number(user.connectionId), userId: typeof user.id === 'string' ? user.id : String(user.connectionId), name: typeof info.name === 'string' && info.name.trim() ? info.name.trim().slice(0, 60) : '協作者', cursor: parseCursor(presence.cursor) }];
  });
}
const colors = ['#bd5269', '#277b73', '#7660ae', '#3974a5', '#986228'];
export function participantColor(userId: string) {
  let hash = 0; for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}
const empty: CanvasParticipant[] = [];
/** Presence is transient and separate from the document and its backups. */
export function createPresenceStore() {
  let participants = empty;
  let cursor: CanvasCursor | null = null;
  let send: ((value: CanvasCursor | null) => void) | undefined;
  const listeners = new Set<() => void>();
  const setCursor = (next: CanvasCursor | null) => {
    if (cursor?.area === next?.area && cursor?.x === next?.x && cursor?.y === next?.y) return;
    cursor = next; send?.(next);
  };
  return {
    getSnapshot: () => participants,
    getServerSnapshot: () => empty,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setParticipants: (next: CanvasParticipant[]) => { participants = next; for (const listener of listeners) listener(); },
    setCursor,
    clearCursor: (area?: CursorArea) => { if (!area || cursor?.area === area) setCursor(null); },
    bind: (callback: typeof send) => { send = callback; if (cursor) send?.(cursor); },
    reset: () => { setCursor(null); send = undefined; participants = empty; for (const listener of listeners) listener(); },
  };
}
export type CanvasPresenceStore = ReturnType<typeof createPresenceStore>;
