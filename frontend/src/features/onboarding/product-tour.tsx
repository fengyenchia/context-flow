'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconHelpCircle } from '@tabler/icons-react';
import type { Step } from 'react-joyride';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';
import { finishTour, shouldStartTour, type TourStage } from './tour-progress';
import { tourSteps } from './tour-steps';

const JoyrideTour = dynamic(() => import('./joyride-tour'), {
  ssr: false,
  loading: () => <p role="status" className="fixed bottom-5 right-5 z-50 rounded-primary border border-border bg-surface p-4 text-sm shadow-md">正在載入教學…</p>,
});

export function ProductTour({ stage, readOnly = false, onBeforeStart }: { stage: TourStage; readOnly?: boolean; onBeforeStart?: () => void }) {
  const userId = useAuthStore(state => state.user?.id);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLSpanElement>(null);
  const startTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(startTimer.current), []);
  const start = useCallback(() => {
    onBeforeStart?.();
    setError('');
    // Resolve targets after React expands collapsed canvas panels.
    window.clearTimeout(startTimer.current);
    startTimer.current = window.setTimeout(() => {
      const available = tourSteps(stage, readOnly).filter(step => typeof step.target === 'string' && document.querySelector(step.target));
      setSteps(available);
      if (available.length) setRunning(true);
    }, 100);
  }, [stage, readOnly, onBeforeStart]);
  useEffect(() => {
    if (!userId || readOnly || !shouldStartTour(userId, stage)) return;
    const timer = window.setTimeout(start, 500);
    return () => window.clearTimeout(timer);
  }, [userId, stage, readOnly, start]);

  return <>
    <span ref={trigger} className={stage === 'canvas' ? 'icon-tooltip shrink-0' : 'shrink-0'} data-tooltip={stage === 'canvas' ? '新手教學' : undefined} data-export-exclude>
      <Button type="button" variant="ghost" size={stage === 'canvas' ? 'icon' : 'sm'} className={stage === 'canvas' ? 'size-9' : 'min-h-11'} aria-label="新手教學" data-tour-replay={stage} disabled={running} onClick={start}>
        <IconHelpCircle className="size-4" aria-hidden="true" />{stage === 'workspace' && '新手教學'}
      </Button>
    </span>
    {error && <p role="status" className="fixed bottom-5 right-5 z-50 max-w-xs rounded-primary border border-border bg-surface p-4 text-sm shadow-md">{error}</p>}
    {running && <JoyrideTour steps={steps} onFinish={outcome => {
      if (userId && outcome !== 'error') finishTour(userId, stage, outcome);
      if (outcome === 'error') setError('教學目前無法定位此區域，請展開區域後再按「新手教學」。');
      setRunning(false);
      window.requestAnimationFrame(() => trigger.current?.querySelector('button')?.focus());
    }} />}
  </>;
}
