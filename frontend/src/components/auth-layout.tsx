import Link from "next/link";
import { BrandLogo } from "./brand-logo";

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]"
    >
      <section
        data-auth-panel
        className="hidden min-w-0 flex-col justify-between gap-16 border-r border-border bg-secondary p-10 text-foreground lg:flex xl:p-14"
      >
        <Link
          href="/"
          className="flex w-fit items-center gap-3 text-lg font-semibold"
        >
          <BrandLogo className="size-10" />
          ContextFlow
        </Link>
        <div className="max-w-xl space-y-8 py-12">
          <p className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            把散落的脈絡，整理成團隊都能前進的下一步。
          </p>
          <p className="text-sm leading-7 text-muted">
            資料整理・發散思考・收斂總結
          </p>
        </div>
        <div aria-hidden="true" />
      </section>
      <section
        data-auth-form
        className="flex min-w-0 items-center justify-center px-5 py-8 sm:p-10"
      >
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-10 flex w-fit items-center gap-2 font-semibold lg:hidden"
          >
            <BrandLogo className="size-9" />
            ContextFlow
          </Link>
          <div className="mb-8 space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm leading-6 text-muted">{description}</p>
            )}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
