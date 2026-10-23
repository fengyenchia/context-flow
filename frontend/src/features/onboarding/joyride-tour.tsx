'use client';

import { useEffect, useId } from 'react';
import { Joyride, EVENTS, STATUS, type EventHandler, type Step, type TooltipRenderProps } from 'react-joyride';
import { Button } from '@/components/ui/button';

function TourTooltip({ backProps, closeProps, primaryProps, skipProps, tooltipProps, index, isLastStep, size, step }: TooltipRenderProps) {
  const titleId = useId();
  const contentId = useId();
  return (
    <div {...tooltipProps} aria-labelledby={titleId} aria-describedby={contentId}
      className="w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-primary border border-border bg-surface p-5 text-foreground shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm tabular-nums">{index + 1} / {size}</p>
        <button type="button" aria-label="關閉教學" onClick={closeProps.onClick} className="-mr-2 -mt-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-primary text-xl hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">×</button>
      </div>
      <h2 id={titleId} className="mt-1 text-lg font-semibold">{step.title}</h2>
      <div id={contentId} className="mt-3 text-base leading-7">{step.content}</div>
      {isLastStep && <a href="/guide" target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">完整手冊（另開分頁）</a>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <Button variant="ghost" className="min-h-11 px-2" onClick={skipProps.onClick}>跳過教學</Button>
        <div className="flex gap-2">
          {index > 0 && <Button variant="outline" className="min-h-11 px-3" onClick={backProps.onClick}>上一步</Button>}
          <Button className="min-h-11 bg-foreground px-3 text-surface hover:bg-foreground/85" onClick={primaryProps.onClick}>{isLastStep ? '完成教學' : '下一步'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function JoyrideTour({ steps, onFinish }: { steps: Step[]; onFinish: (outcome: 'finished' | 'skipped' | 'error') => void }) {
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onFinish('skipped');
    };
    document.addEventListener('keydown', dismiss, true);
    return () => document.removeEventListener('keydown', dismiss, true);
  }, [onFinish]);
  const onEvent: EventHandler = event => {
    if (event.type === EVENTS.TOUR_END) onFinish(event.status === STATUS.FINISHED ? 'finished' : 'skipped');
    if (event.type === EVENTS.ERROR || event.type === EVENTS.TARGET_NOT_FOUND) onFinish('error');
  };
  return <Joyride continuous run steps={steps} tooltipComponent={TourTooltip} onEvent={onEvent} styles={{ floater: { transition: 'none' } }}
    floatingOptions={{
      strategy: 'fixed',
      // Large canvas targets leave no room above/below. Shift on both axes so
      // the tooltip stays inside the viewport even when it must overlap them.
      shiftOptions: { boundary: [], rootBoundary: 'viewport', padding: 16, crossAxis: true },
      flipOptions: { boundary: [], rootBoundary: 'viewport', padding: 16 },
    }}
    locale={{ back: '上一步', close: '關閉教學', last: '完成教學', next: '下一步', skip: '跳過教學', open: '開啟教學' }}
    options={{ skipBeacon: true, blockTargetInteraction: true, overlayClickAction: false, dismissKeyAction: false, closeButtonAction: 'skip', scrollDuration: 0, scrollOffset: 24, targetWaitTimeout: 2500, spotlightPadding: 5, spotlightRadius: 8, arrowColor: 'var(--surface)', zIndex: 1000 }} />;
}
