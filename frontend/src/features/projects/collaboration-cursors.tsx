"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { useReactFlow, ViewportPortal } from '@xyflow/react';
import { participantColor, type CanvasPresenceStore, type CursorArea } from './canvas-presence';

export const CanvasPresenceContext = createContext<CanvasPresenceStore | null>(null);
export function OnlineCollaborators() {
  const store = useContext(CanvasPresenceContext);
  return store ? <ParticipantNames store={store} /> : null;
}
function ParticipantNames({ store }: { store: CanvasPresenceStore }) {
  const participants = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const users = [...new Map(participants.map(person => [person.userId, person])).values()];
  if (!users.length) return null;
  return <span role="group" aria-label="其他在線協作者" data-collaboration-presence className="flex max-w-52 items-center gap-2 overflow-hidden text-xs text-muted">
    {users.slice(0, 3).map(person => <span key={person.userId} className="inline-flex min-w-0 items-center gap-1"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: participantColor(person.userId) }} /><span className="max-w-20 truncate">{person.name}</span></span>)}
    {users.length > 3 && <span className="shrink-0">+{users.length - 3}</span>}
  </span>;
}
export function CanvasCursorLayer({ area }: { area: CursorArea }) {
  const store = useContext(CanvasPresenceContext);
  return store ? <ConnectedCursorLayer area={area} store={store} /> : null;
}
function ConnectedCursorLayer({ area, store }: { area: CursorArea; store: CanvasPresenceStore }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const participants = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => {
    const pane = anchor.current?.closest('.react-flow');
    if (!pane) return;
    const move = (event: Event) => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType === 'touch' || document.hidden) return;
      const target = pointer.target;
      if (target instanceof Element && target.closest('button, input, textarea, [role="dialog"], .react-flow__controls, .react-flow__minimap')) { store.clearCursor(area); return; }
      const position = screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }, { snapToGrid: false });
      store.setCursor({ area, ...position });
    };
    const leave = () => store.clearCursor(area);
    const blur = () => store.clearCursor();
    const visibility = () => { if (document.hidden) blur(); };
    pane.addEventListener('pointermove', move);
    pane.addEventListener('pointerleave', leave);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => { pane.removeEventListener('pointermove', move); pane.removeEventListener('pointerleave', leave); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); leave(); };
  }, [area, store, screenToFlowPosition]);
  return <>
    <span ref={anchor} hidden data-collaboration-presence />
    <ViewportPortal>
      {participants.filter(person => person.cursor?.area === area).map(person => <div key={person.connectionId} aria-hidden="true" data-collaboration-presence data-remote-cursor={person.connectionId} data-cursor-area={area} data-cursor-user={person.name} className="pointer-events-none absolute z-40 flex items-start" style={{ left: person.cursor!.x, top: person.cursor!.y }}>
        <svg width="18" height="22" viewBox="0 0 18 22" className="shrink-0" fill={participantColor(person.userId)} stroke="white" strokeWidth="1.5"><path d="M2 1.5v17l4.5-4 3.5 6 3-1.8-3.5-6 6-1.2Z" /></svg>
        <span className="mt-4 max-w-40 truncate rounded-primary border bg-surface px-2 py-0.5 text-xs text-foreground shadow-sm" style={{ borderColor: participantColor(person.userId) }}>{person.name}</span>
      </div>)}
    </ViewportPortal>
  </>;
}
