import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { guideSections } from '@/features/guide/guide-content';
import { GuideToc } from '@/features/guide/guide-toc';
import { site, siteMetadata } from '@/lib/site-metadata';

const description = 'ContextFlow 使用手冊：註冊、共享權限、雙擊編輯節點與連線、節點分色、AI、儲存衝突，以及 PDF／PNG 匯出的完整操作步驟。';

export const metadata: Metadata = {
  title: '使用手冊',
  description,
  alternates: { canonical: '/guide' },
  openGraph: { ...siteMetadata.openGraph, title: `使用手冊 · ${site.name}`, description, url: `${site.url}/guide` },
  twitter: { card: 'summary_large_image', title: `使用手冊 · ${site.name}`, description, images: [site.image] },
};

const focus = 'rounded-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      <header className="border-b border-border bg-surface print:hidden">
        <nav aria-label="手冊導覽" className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-8">
          <Link href="/" aria-label="ContextFlow 首頁" className={`inline-flex min-h-11 items-center gap-2 font-semibold ${focus}`}><BrandLogo className="size-8" />ContextFlow</Link>
          <Link href="/workspaces" className={`inline-flex min-h-11 items-center px-3 text-sm font-medium hover:bg-secondary ${focus}`}>開啟工作區</Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-5 py-10 outline-none sm:px-8 sm:py-14 print:max-w-none print:px-0 print:py-0">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">使用手冊</h1>
        <p className="mt-4 max-w-2xl text-base leading-8">從第一個專案，到節點編輯、共享與匯出。依目錄跳到需要的操作，或用瀏覽器搜尋關鍵字。</p>
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14 print:block">
          <aside className="rounded-primary border border-border bg-surface p-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto print:hidden">
            <GuideToc sections={guideSections.map(({ id, title }) => ({ id, title }))} />
          </aside>
          <article aria-label="操作說明" className="min-w-0 space-y-14 print:space-y-8">
            {guideSections.map(({ id, title, topics }, index) => (
              <section key={id} id={id} aria-labelledby={`${id}-title`} tabIndex={-1} className="scroll-mt-8 border-t border-border pt-6 outline-none print:scroll-mt-0">
                <h2 id={`${id}-title`} className="text-2xl font-semibold leading-snug"><span className="mr-3 text-base tabular-nums" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>{title}</h2>
                <div className="mt-7 space-y-8">
                  {topics.map(({ title: topicTitle, paragraphs, steps, items, warning }) => (
                    <div key={topicTitle} className="space-y-4 text-base leading-8 [overflow-wrap:anywhere]">
                      <h3 className="text-lg font-semibold">{topicTitle}</h3>
                      {paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                      {steps && <ol className="list-decimal space-y-3 pl-6 marker:font-semibold">{steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol>}
                      {items && <dl className="divide-y divide-border">{items.map(([term, detail]) => <div key={term} className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-5"><dt className="font-semibold">{term}</dt><dd>{detail}</dd></div>)}</dl>}
                      {warning && <p className="rounded-primary border border-border border-l-4 border-l-primary bg-surface px-4 py-3 print:break-inside-avoid print:bg-transparent"><strong className="mr-2 font-semibold">注意</strong>{warning}</p>}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>
      <footer className="border-t border-border print:hidden"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8"><span className="text-sm">ContextFlow 使用手冊</span><Link href="/workspaces" className={`inline-flex min-h-11 items-center px-3 font-medium hover:bg-secondary ${focus}`}>開啟工作區</Link></div></footer>
    </div>
  );
}
