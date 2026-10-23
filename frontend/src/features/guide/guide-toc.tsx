'use client';

import { useEffect, useRef, useState } from 'react';

export function GuideToc({ sections }: { sections: { id: string; title: string }[] }) {
  const [activeId, setActiveId] = useState<string | undefined>(sections[0]?.id);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const readingLine = Math.min(120, window.innerHeight * 0.2);
      let current: string | undefined = sections[0]?.id;
      for (const { id } of sections) {
        if ((document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= readingLine) current = id;
      }
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = sections.at(-1)?.id;
      }
      setActiveId(current);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
    };
  }, [sections]);

  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    const link = list.current?.querySelector<HTMLAnchorElement>('[aria-current="location"]');
    const panel = list.current?.closest('aside');
    if (!link || !panel) return;
    const item = link.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    // Scroll only the directory, never shift the article the user is reading.
    if (item.top < bounds.top + 8) panel.scrollTop -= bounds.top + 8 - item.top;
    else if (item.bottom > bounds.bottom - 8) panel.scrollTop += item.bottom - bounds.bottom + 8;
  }, [activeId]);

  return <nav aria-label="手冊目錄">
    <h2 className="mb-2 px-2 font-semibold">目錄</h2>
    <ol ref={list} className="grid sm:grid-cols-2 lg:grid-cols-1">
      {sections.map(({ id, title }, index) => <li key={id}>
        <a href={`#${id}`} aria-current={activeId === id ? 'location' : undefined} onClick={() => setActiveId(id)}
          className={`flex min-h-11 items-center gap-3 rounded-primary px-2 py-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${activeId === id ? 'bg-secondary font-semibold' : 'hover:bg-secondary'}`}>
          <span aria-hidden="true" className="w-5 shrink-0 tabular-nums">{String(index + 1).padStart(2, '0')}</span>{title}
        </a>
      </li>)}
    </ol>
  </nav>;
}
