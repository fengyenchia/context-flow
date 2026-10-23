import type { Metadata } from 'next';
import Link from 'next/link';
import {
  IconArrowRight as ArrowRight,
  IconChevronDown as ChevronDown,
  IconDownload as Download,
  IconFileSearch as FileSearch,
  IconGitBranch as GitBranch,
  IconUsers as Users,
} from '@tabler/icons-react';
import { BrandLogo } from '@/components/brand-logo';
import { HomeMotion } from '@/features/home/home-motion';

export const metadata: Metadata = { alternates: { canonical: '/' } };

const linkFocus = 'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground';
const primaryLink = `inline-flex min-h-12 items-center justify-center gap-2 rounded-primary bg-foreground px-6 font-semibold text-surface hover:opacity-85 ${linkFocus}`;
const navigation = [
  { target: 'features', label: '功能' },
  { target: 'workflow', label: '使用方式' },
  { target: 'faq', label: '常見問題' },
];
const features = [
  { title: '資料集中整理', description: '把文字、連結與檔案放進資料池，保留專案需要的參考。', icon: FileSearch },
  { title: '想法連成脈絡', description: '用節點、分色與連線整理想法，從發散思考走到明確結論。', icon: GitBranch },
  { title: '個人與團隊工作區', description: '自己整理，或邀請成員加入，依角色分配檢視與編輯權限。', icon: Users },
  { title: '成果隨時帶走', description: '匯出分頁 PDF 或 PNG 圖片 ZIP，方便討論、簡報與留存。', icon: Download },
];
const steps = [
  { title: '加入資料', description: '建立專案，放入筆記、連結與檔案。' },
  { title: '整理與發散', description: '建立資料架構，延伸想法，連起彼此的關係。' },
  { title: '收斂與分享', description: '整理結論與下一步，再邀請成員或匯出成果。' },
];
const questions = [
  { question: '一定要使用 AI 嗎？', answer: '不需要。資料池、節點編輯、連線與匯出都能獨立使用。需要 AI 協助整理時，再到「AI Key」設定自己的 Gemini API Key。' },
  { question: '可以和團隊一起編輯嗎？', answer: '可以建立共享工作區，邀請已註冊的成員加入，並設定檢視或編輯權限。多人同時修改時會提示版本衝突，避免互相覆蓋；目前不是即時同步共編。' },
  { question: '可以匯出哪些格式？', answer: '支援分頁 PDF 與 PNG 圖片。大型畫布會分片輸出，PNG 會以 ZIP 壓縮檔下載。' },
  { question: '第一次使用要做什麼？', answer: '註冊後，先從信箱完成 Email 驗證，再登入個人工作區建立專案。你可以先加入一段文字，試著建立與編輯節點。' },
];

function CanvasPreview() {
  const columns = [
    { title: '資料架構', nodes: ['專案目標', '訪談紀錄', '參考資料'], color: 'bg-[var(--node-outcome)]' },
    { title: '發散思考', nodes: ['可行方向', '操作流程', '待驗證假設'], color: 'bg-[var(--node-reference)]' },
    { title: '收斂總結', nodes: ['優先項目', '實作範圍', '下一步安排'], color: 'bg-[var(--node-context)]' },
  ];

  return (
    <figure data-home-preview className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-sm" aria-labelledby="canvas-preview-caption">
      <figcaption id="canvas-preview-caption" className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 text-sm sm:px-5">
        <span className="flex items-center gap-2 font-semibold"><BrandLogo className="size-6" />網站改版</span>
        <span className="text-muted">畫布示意</span>
      </figcaption>
      <div className="grid grid-cols-3 divide-x divide-border">
        {columns.map(({ title, nodes, color }) => (
          <div key={title} className="min-w-0">
            <p className="border-b border-border px-1 py-4 text-center text-xs font-semibold sm:text-sm">{title}</p>
            <div className="canvas-grid flex min-h-64 flex-col items-center px-2 py-7 sm:px-4 sm:py-9">
              {nodes.map((node, index) => (
                <div key={node} className="flex w-full flex-col items-center">
                  {index > 0 && <span data-home-connection aria-hidden="true" className="h-6 w-px bg-primary" />}
                  <div data-home-node className={`flex min-h-12 w-full items-center justify-center rounded-primary border border-border px-1.5 py-3 text-center text-xs font-medium leading-5 sm:px-3 sm:text-sm ${color}`}>
                    {node}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

export default function HomePage() {
  return (
    <HomeMotion>
      <header className="border-b border-border">
        <nav className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8" aria-label="主要導覽">
          <Link href="/" className={`flex min-h-11 shrink-0 items-center gap-2 font-semibold ${linkFocus}`} aria-label="ContextFlow 首頁">
            <BrandLogo className="size-8 sm:size-9" />ContextFlow
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/login" className={`inline-flex min-h-11 items-center rounded-primary px-3 text-sm font-semibold hover:bg-secondary ${linkFocus}`}>登入</Link>
            <Link href="/register" className={`inline-flex min-h-11 items-center rounded-primary bg-foreground px-4 text-sm font-semibold text-surface hover:opacity-85 ${linkFocus}`}>註冊</Link>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:py-24" aria-labelledby="hero-title">
          <div>
            <h1 data-home-hero id="hero-title" className="text-4xl font-semibold leading-[1.3] tracking-tight sm:text-5xl">
              整理資料，<br />串起想法與決策。
            </h1>
            <p data-home-hero className="mt-6 max-w-md text-base leading-8 text-muted sm:text-lg">
              把資料、討論和下一步放在同一張畫布。<br className="hidden sm:block" />自己整理，也能邀請團隊一起編輯。
            </p>
            <div data-home-hero className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/register" className={primaryLink}>建立帳號<ArrowRight aria-hidden="true" className="size-4" /></Link>
              <button type="button" data-home-scroll="workflow" className={`inline-flex min-h-12 cursor-pointer items-center px-2 font-medium hover:text-muted ${linkFocus}`}>了解使用方式</button>
            </div>
          </div>
          <CanvasPreview />
        </section>

        <section id="features" tabIndex={-1} className="scroll-mt-8 border-y border-border bg-surface" aria-labelledby="features-title">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <h2 data-home-reveal id="features-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">專案需要的內容，放在一起</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ title, description, icon: Icon }) => (
                <article data-home-reveal key={title}>
                  <div className="mb-5 inline-flex size-11 items-center justify-center rounded-primary bg-secondary text-foreground"><Icon aria-hidden="true" className="size-5" stroke={1.6} /></div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-3 text-base leading-7 text-muted">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" tabIndex={-1} className="mx-auto max-w-6xl scroll-mt-8 px-5 py-16 sm:px-8 sm:py-20" aria-labelledby="workflow-title">
          <h2 data-home-reveal id="workflow-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">從資料到下一步</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {steps.map(({ title, description }, index) => (
              <li data-home-reveal key={title} className="border-t border-border pt-6">
                <span className="text-sm font-semibold text-muted" aria-hidden="true">0{index + 1}</span>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-base leading-7 text-muted">{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="faq" tabIndex={-1} className="border-t border-border bg-surface" aria-labelledby="faq-title">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-[1fr_2fr] md:gap-16">
            <h2 data-home-reveal id="faq-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">常見問題</h2>
            <div data-home-reveal className="divide-y divide-border">
              {questions.map(({ question, answer }) => (
                <details data-home-faq key={question}>
                  <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden ${linkFocus}`}>
                    {question}<ChevronDown data-home-faq-icon aria-hidden="true" className="size-4 shrink-0" />
                  </summary>
                  <div data-home-faq-content><p className="max-w-2xl pb-6 pr-4 text-base leading-8 text-muted">{answer}</p></div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary" aria-labelledby="start-title">
          <div data-home-reveal className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center">
            <div><h2 id="start-title" className="text-2xl font-semibold">從你的第一個專案開始</h2><p className="mt-3 leading-7 text-muted">先放進一份資料，再慢慢把想法連起來。</p></div>
            <Link href="/register" className={`${primaryLink} shrink-0`}>開始整理專案<ArrowRight aria-hidden="true" className="size-4" /></Link>
          </div>
        </section>
      </main>

      <footer>
        <div data-home-reveal className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Link href="/" className={`inline-flex min-h-11 items-center gap-2 font-semibold ${linkFocus}`} aria-label="ContextFlow 首頁"><BrandLogo className="size-8" />ContextFlow</Link>
            <p className="mt-3 text-sm leading-7 text-muted">專案資料與討論的共同畫布。</p>
          </div>
          <nav aria-label="頁尾產品導覽">
            <h2 className="mb-2 text-sm font-semibold">產品</h2>
            <ul>{navigation.map(({ target, label }) => <li key={target}><button type="button" data-home-scroll={target} className={`inline-flex min-h-11 cursor-pointer items-center text-sm text-muted hover:text-foreground ${linkFocus}`}>{label}</button></li>)}</ul>
          </nav>
          <nav aria-label="頁尾資源導覽">
            <h2 className="mb-2 text-sm font-semibold">資源</h2>
            <ul>
              <li><a href="https://github.com/fengyenchia/context-flow" className={`inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground ${linkFocus}`}>GitHub</a></li>
              <li><a href="https://github.com/fengyenchia/context-flow#readme" className={`inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground ${linkFocus}`}>專案文件</a></li>
              <li><Link href="/login" className={`inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground ${linkFocus}`}>登入工作區</Link></li>
            </ul>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl border-t border-border px-5 py-6 text-sm text-muted sm:px-8">© {new Date().getFullYear()} ContextFlow</div>
      </footer>
    </HomeMotion>
  );
}


