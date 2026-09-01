'use client';

import { useCallback, useRef, useState } from 'react';

export function useVerticalSplit(initial = 52) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [topPercent, setTopPercent] = useState(initial);

  const beginDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const container = containerRef.current;
    if (!container) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const next = ((moveEvent.clientY - rect.top) / rect.height) * 100;
      setTopPercent(Math.min(100, Math.max(0, next)));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }, []);

  return { containerRef, topPercent, beginDrag };
}
