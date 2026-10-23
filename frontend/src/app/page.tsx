import Link from 'next/link';
import { IconArrowRight as ArrowRight, IconFileSearch as FileSearch, IconGitBranch as GitBranch, IconSparkles as Sparkles, IconUsers as Users } from '@tabler/icons-react';
import { BrandLogo } from '@/components/brand-logo';

export default function HomePage() {
  return (
    <main id="main-content" className="min-h-screen overflow-hidden">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8" aria-label="主要導覽">
        <Link href="/" className="flex items-center gap-2 font-semibold"><BrandLogo className="size-9" />ContextFlow</Link>
        <div className="flex items-center gap-2"><Link href="/login" className="rounded-primary px-4 py-2 text-sm font-semibold hover:bg-secondary">登入</Link><Link href="/register" className="rounded-primary bg-foreground px-4 py-2 text-sm font-semibold text-surface">註冊</Link></div>
      </nav>
      <section className="relative mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
        <div className="max-w-4xl"><h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">整理資料、討論與決策</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-muted">用節點畫布管理專案，與團隊一起編輯。</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-primary bg-primary px-6 font-semibold text-surface hover:bg-primary-strong">建立帳號<ArrowRight className="size-4" /></Link><Link href="/login" className="inline-flex h-12 items-center justify-center rounded-primary border border-border bg-surface px-6 font-semibold hover:bg-secondary">登入</Link></div></div>
        <div className="mt-20 grid gap-px overflow-hidden rounded-primary border border-border bg-border md:grid-cols-4">
          {[['共享工作區', Users], ['節點連線', GitBranch], ['資料整理', FileSearch], ['AI 摘要', Sparkles]].map(([title, Icon]) => { const C = Icon as typeof Users; return <div key={title as string} className="flex items-center gap-3 bg-surface p-6"><C className="size-5 text-primary" /><h2 className="font-semibold">{title as string}</h2></div>; })}
        </div>
      </section>
    </main>
  );
}


