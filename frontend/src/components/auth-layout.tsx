import Link from 'next/link';
import { BrandLogo } from './brand-logo';

export function AuthLayout({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <main id="main-content" className="flex min-h-screen flex-col px-5 py-8 sm:px-8">
      <Link href="/" className="mx-auto flex items-center gap-2 font-semibold"><BrandLogo className="size-9" />ContextFlow</Link>
      <section className="mx-auto flex w-full max-w-md flex-1 items-center py-12">
        <div className="w-full">
          <div className="mb-8 space-y-2"><h1 className="text-3xl font-semibold tracking-tight">{title}</h1>{description && <p className="text-sm leading-6 text-muted">{description}</p>}</div>
          {children}
        </div>
      </section>
    </main>
  );
}

