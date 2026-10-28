import { describe, expect, it, vi } from 'vitest';
import { createPresenceStore, parseCursor, participantColor, readParticipants } from './canvas-presence';

describe('ephemeral canvas presence', () => {
  it('accepts only finite, bounded positions in a known canvas area', () => {
    expect(parseCursor({ area: 'converge', x: -50, y: 120 })).toEqual({ area: 'converge', x: -50, y: 120 });
    for (const cursor of [null, { area: 'pool', x: 1, y: 1 }, { area: 'zone', x: NaN, y: 0 }, { area: 'zone', x: Infinity, y: 0 }, { area: 'zone', x: 1e20, y: 0 }, { area: 'zone', x: '10', y: 2 }]) expect(parseCursor(cursor)).toBeNull();
  });
  it('filters malformed users and limits display names without accepting remote styles', () => {
    const result = readParticipants([null, {}, { connectionId: -1 }, { connectionId: 3, id: 'u', info: { name: 'A'.repeat(100), color: 'url(secret)' }, presence: { cursor: { area: 'zone', x: 0, y: 0 } } }]);
    expect(result).toHaveLength(1); expect(result[0].name).toHaveLength(60); expect(result[0]).not.toHaveProperty('color');
    expect(participantColor('u')).toBe(participantColor('u'));
  });
  it('clears only the departed area, flushes pending position on bind and resets on project change', () => {
    const store = createPresenceStore(), send = vi.fn(), listener = vi.fn(); const unsubscribe = store.subscribe(listener);
    store.setCursor({ area: 'zone', x: 1, y: 2 }); store.bind(send);
    expect(send).toHaveBeenLastCalledWith({ area: 'zone', x: 1, y: 2 });
    store.clearCursor('diverge'); expect(send).toHaveBeenCalledTimes(1);
    store.setCursor({ area: 'zone', x: 1, y: 2 }); expect(send).toHaveBeenCalledTimes(1);
    store.clearCursor('zone'); expect(send).toHaveBeenLastCalledWith(null);
    store.setParticipants([{ connectionId: 1, userId: 'u', name: 'u', cursor: null }]); expect(listener).toHaveBeenCalledOnce();
    store.reset(); expect(store.getSnapshot()).toEqual([]); unsubscribe(); store.setParticipants([]); expect(listener).toHaveBeenCalledTimes(2);
    store.setCursor({ area: 'zone', x: 4, y: 5 }); expect(send).toHaveBeenCalledTimes(2);
  });
});
