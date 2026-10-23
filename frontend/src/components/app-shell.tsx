"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconBook2 as Book,
  IconRobot as Bot,
  IconKey as KeyRound,
  IconLayoutGrid as LayoutGrid,
  IconLogout as LogOut,
  IconMenu2 as Menu,
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconSettings as Settings,
  IconShieldCheck as ShieldCheck,
  IconX as X,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { logout as logoutApi } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { RequireAuth } from "./require-auth";
import { BrandLogo } from "./brand-logo";

const nav = [
  { href: "/workspaces", label: "工作區", icon: LayoutGrid },
  { href: "/settings/ai", label: "AI Key", icon: Bot },
  { href: "/settings/account", label: "帳號設定", icon: Settings },
  { href: "/settings/security", label: "密碼與安全性", icon: KeyRound },
  { href: "/guide", label: "使用手冊", icon: Book },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inProject = pathname.includes("/projects/");
  const router = useRouter();
  const user = useAuthStore((state) => state.user)!;
  const clear = useAuthStore((state) => state.clear);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  async function logout() {
    await logoutApi().catch(() => undefined);
    clear();
    router.push("/login");
  }

  const sidebar = (
    <aside
      className={`flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-sidebar p-3 transition-[width] duration-200 ${collapsed ? "w-[72px]" : "w-[272px]"}`}
    >
      <div
        className={cn(
          "flex h-12 shrink-0 flex-nowrap items-center gap-3 px-2",
          collapsed && "justify-end",
        )}
      >
        {!collapsed && (
          <>
            <BrandLogo className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">ContextFlow</p>
            </div>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "展開側欄" : "收合側欄"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
      </div>
      <nav
        className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto"
        aria-label="應用程式導覽"
      >
        {[
          ...nav,
          ...(user?.role === "admin"
            ? [{ href: "/admin/users", label: "帳號管理", icon: ShieldCheck }]
            : []),
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-label={label}
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-primary px-3 text-sm font-medium text-muted hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              collapsed && "justify-center px-0",
              pathname.startsWith(href) &&
                "bg-surface text-foreground shadow-sm",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto shrink-0 border-t border-border pt-3">
        <div
          className={cn(
            "flex w-full items-center gap-3 rounded-primary p-2 text-left",
            collapsed && "justify-center",
          )}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
            {user?.displayName?.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {user?.displayName}
              </span>
              <span className="block truncate text-xs text-muted">
                @{user?.username}
              </span>
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          className={cn(
            "mt-1 w-full justify-start text-muted",
            collapsed && "justify-center px-0",
          )}
          onClick={logout}
          aria-label="登出"
        >
          <LogOut className="size-4" />
          {!collapsed && "登出"}
        </Button>
      </div>
    </aside>
  );

  return (
    <RequireAuth>
      <div
        className={
          inProject ? "flex min-h-screen" : "flex h-dvh overflow-hidden"
        }
      >
        {!inProject && (
          <div className="hidden h-full shrink-0 lg:block">{sidebar}</div>
        )}
        {!inProject && open && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <button
              className="absolute inset-0 bg-foreground/35"
              onClick={() => setOpen(false)}
              aria-label="關閉導覽"
            />{" "}
            <div className="relative">
              {sidebar}
              <button
                className="absolute right-3 top-3 grid size-10 place-items-center rounded-primary"
                onClick={() => setOpen(false)}
                aria-label="關閉導覽"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>
        )}
        <div
          className={cn(
            "min-w-0 flex-1",
            !inProject && "flex min-h-0 flex-col overflow-hidden",
          )}
        >
          {!inProject && (
            <header className="flex h-16 shrink-0 items-center border-b border-border bg-surface px-4 lg:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(true)}
                aria-label="開啟導覽"
              >
                <Menu className="size-5" />
              </Button>
              <BrandLogo className="ml-2 size-8" />
              <span className="ml-2 font-semibold">ContextFlow</span>
            </header>
          )}
          <main
            id="main-content"
            className={
              inProject
                ? "min-h-[calc(100vh-4rem)] lg:min-h-screen"
                : "min-h-0 flex-1 overflow-y-auto"
            }
          >
            {children}
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}
