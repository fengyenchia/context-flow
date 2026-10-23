'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

export function HomeMotion({ children }: { children: React.ReactNode }) {
  const container = useRef<HTMLDivElement>(null);

  useGSAP((_context, contextSafe) => {
    const root = container.current;
    if (!root || !contextSafe) return;
    const cleanup: Array<() => void> = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const media = gsap.matchMedia();
    let scrollTween: gsap.core.Tween | undefined;

    media.add('(prefers-reduced-motion: no-preference)', () => {
      const intro = gsap.timeline({ defaults: { duration: 0.55, ease: 'power2.out', clearProps: 'transform,opacity' } });
      intro.from(root.querySelectorAll('[data-home-hero]'), { y: 22, opacity: 0, stagger: 0.1 })
        .from(root.querySelectorAll('[data-home-preview]'), { y: 18, opacity: 0 }, '<0.15')
        .from(root.querySelectorAll('[data-home-node]'), { y: 8, opacity: 0, stagger: 0.035, duration: 0.35 }, '<0.1')
        .from(root.querySelectorAll('[data-home-connection]'), { scaleY: 0, transformOrigin: 'top', stagger: 0.03, duration: 0.3 }, '<0.1');

      // Keep keyboard destinations focusable while their visual entrance runs.
      root.querySelectorAll<HTMLElement>('[data-home-reveal]').forEach(element => {
        gsap.from(element, {
          y: 20, opacity: 0, duration: 0.5, ease: 'power2.out', clearProps: 'transform,opacity',
          scrollTrigger: { trigger: element, start: 'top 92%', once: true },
        });
      });
    }, container);

    root.querySelectorAll<HTMLButtonElement>('[data-home-scroll]').forEach(button => {
      const onClick = contextSafe(() => {
        const id = button.dataset.homeScroll;
        const target = id ? root.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
        if (!target) return;
        scrollTween?.kill();
        scrollTween = gsap.to(window, {
          scrollTo: { y: target, offsetY: 24, autoKill: true },
          duration: reducedMotion.matches ? 0 : 0.65,
          ease: 'power2.inOut',
          onComplete: () => target.focus({ preventScroll: true }),
        });
      });
      button.addEventListener('click', onClick);
      cleanup.push(() => button.removeEventListener('click', onClick));
    });

    const intendedOpen = new Map<HTMLDetailsElement, boolean>();
    const details = root.querySelectorAll<HTMLDetailsElement>('details[data-home-faq]');
    details.forEach(detail => {
      const summary = detail.querySelector('summary');
      const panel = detail.querySelector<HTMLElement>('[data-home-faq-content]');
      const icon = detail.querySelector('[data-home-faq-icon]');
      if (!summary || !panel || !icon) return;
      const onClick = contextSafe((event: MouseEvent) => {
        event.preventDefault();
        const opening = !(intendedOpen.get(detail) ?? detail.open);
        intendedOpen.set(detail, opening);
        const height = detail.open ? panel.getBoundingClientRect().height : 0;
        detail.open = true;
        gsap.fromTo(panel, { height, overflow: 'hidden' }, {
          height: opening ? panel.scrollHeight : 0,
          duration: reducedMotion.matches ? 0 : 0.28,
          ease: 'power2.inOut', overwrite: true,
          onComplete: contextSafe(() => {
            detail.open = opening;
            gsap.set(panel, { clearProps: 'height,overflow' });
            ScrollTrigger.refresh();
          }),
        });
        gsap.to(icon, { rotation: opening ? 180 : 0, duration: reducedMotion.matches ? 0 : 0.24, overwrite: true });
      });
      summary.addEventListener('click', onClick);
      cleanup.push(() => summary.removeEventListener('click', onClick));
    });

    const onPreferenceChange = contextSafe(() => {
      if (!reducedMotion.matches) return;
      scrollTween?.progress(1).kill();
      details.forEach(detail => {
        const panel = detail.querySelector<HTMLElement>('[data-home-faq-content]');
        const icon = detail.querySelector('[data-home-faq-icon]');
        if (!panel || !icon) return;
        gsap.killTweensOf([panel, icon]);
        detail.open = intendedOpen.get(detail) ?? detail.open;
        gsap.set(panel, { clearProps: 'height,overflow' });
        gsap.set(icon, { rotation: detail.open ? 180 : 0 });
      });
      ScrollTrigger.refresh();
    });
    reducedMotion.addEventListener('change', onPreferenceChange);

    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      const element = target instanceof Element ? target.closest('[data-home-reveal], [data-home-hero]') : null;
      if (element && root.contains(element)) gsap.getTweensOf(element).forEach(tween => tween.progress(1).kill());
    };
    root.addEventListener('focusin', onFocus);

    let active = true;
    void document.fonts.ready.then(() => { if (active) ScrollTrigger.refresh(); });
    root.dataset.motionReady = 'true';

    return () => {
      active = false;
      delete root.dataset.motionReady;
      cleanup.forEach(remove => remove());
      root.removeEventListener('focusin', onFocus);
      reducedMotion.removeEventListener('change', onPreferenceChange);
      media.revert();
    };
  }, { scope: container });

  return <div ref={container} className="min-h-dvh" data-home-motion>{children}</div>;
}
