import Link from 'next/link';
import { IconBlocks as Blocks, IconCircleCheck as CheckCircle2 } from '@tabler/icons-react';

export function AuthLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main id="main-content" className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden overflow-hidden bg-secondary p-10 text-foreground lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3 text-lg font-semibold"><span className="grid size-10 place-items-center rounded-primary bg-primary/20 text-primary"><Blocks className="size-5" /></span>ContextFlow</Link>
        <div className="max-w-xl space-y-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Think together, clearly</p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.04em]">把散落的脈絡，整理成團隊都能前進的下一步。</h1>
          <ul className="grid gap-4 text-sm text-muted sm:grid-cols-2">
            {['多人共編思考畫布', '自己的 Gemini API Key', '文件引用可追溯', '從發散到收斂'].map((item) => <li key={item} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" />{item}</li>)}
          </ul>
        </div>
        <p className="text-xs text-muted">ContextFlow · Collaborative project thinking</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center gap-2 font-semibold lg:hidden"><Blocks className="size-5 text-primary" />ContextFlow</Link>
          <div className="mb-8 space-y-2"><h2 className="text-3xl font-semibold tracking-[-0.03em]">{title}</h2><p className="leading-7 text-muted">{description}</p></div>
          {children}
        </div>
      </section>
    </main>
  );
}

