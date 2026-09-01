import Link from 'next/link';
import { IconArrowRight as ArrowRight, IconBlocks as Blocks, IconFileSearch as FileSearch, IconGitBranch as GitBranch, IconSparkles as Sparkles, IconUsers as Users } from '@tabler/icons-react';

export default function HomePage() {
  return (
    <main id="main-content" className="min-h-screen overflow-hidden">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8" aria-label="主要導覽">
        <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid size-9 place-items-center rounded-primary bg-primary text-surface"><Blocks className="size-4" /></span>ContextFlow</Link>
        <div className="flex items-center gap-2"><Link href="/login" className="rounded-primary px-4 py-2 text-sm font-semibold hover:bg-secondary">登入</Link><Link href="/register" className="rounded-primary bg-foreground px-4 py-2 text-sm font-semibold text-surface">註冊</Link></div>
      </nav>
      <section className="relative mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
        <div className="absolute -right-32 top-0 -z-10 size-[34rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="max-w-4xl"><p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-primary">Collaborative context canvas</p><h1 className="text-5xl font-semibold leading-[1.03] tracking-[-0.055em] sm:text-7xl">把討論、資料與決策，放進同一條思考脈絡。</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-muted">ContextFlow 讓團隊從文件依據開始發散，再用 AI 收斂成可以執行的規格。每個人使用自己的 Gemini Key，專案內容依 Workspace 權限隔離。</p><div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-primary bg-primary px-6 font-semibold text-surface hover:bg-primary-strong">建立工作區<ArrowRight className="size-4" /></Link><Link href="/login" className="inline-flex h-12 items-center justify-center rounded-primary border border-border bg-surface px-6 font-semibold hover:bg-secondary">開啟既有專案</Link></div></div>
        <div className="mt-20 grid gap-px overflow-hidden rounded-primary border border-border bg-border md:grid-cols-4">
          {[['多人共編', Users, 'Presence、角色與同步畫布'], ['脈絡連線', GitBranch, '節點、來源與相依關係'], ['文件依據', FileSearch, 'RAG 引用回到原始片段'], ['AI 收斂', Sparkles, '用自己的 Key 產出下一步']].map(([title, Icon, text]) => { const C = Icon as typeof Users; return <div key={title as string} className="bg-surface p-6"><C className="mb-8 size-5 text-primary" /><h2 className="font-semibold">{title as string}</h2><p className="mt-2 text-sm leading-6 text-muted">{text as string}</p></div>; })}
        </div>
      </section>
    </main>
  );
}


