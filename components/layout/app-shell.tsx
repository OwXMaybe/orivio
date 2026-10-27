"use client";

import { BarChart3, BookMarked, CircleHelp, Compass, FolderSearch, LayoutDashboard, LogOut, Menu, Microscope, Moon, Settings, Sun, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usePreferences } from "@/lib/i18n/preferences";
import { useAuth } from "../auth/auth-provider";
import { cn } from "../ui/primitives";
import { Logo } from "./logo";

const NAV = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/investigate", key: "investigate", icon: Microscope },
  { href: "/explore", key: "explore", icon: Compass },
  { href: "/investigations", key: "investigations", icon: FolderSearch },
  { href: "/sources", key: "sources", icon: BookMarked },
  { href: "/statistics", key: "statistics", icon: BarChart3 },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t, language, theme, set } = usePreferences();
  const { user, configured, signOut } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-5">
        <Logo subtitle={t.brand.sub} />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                active ? "bg-accent/10 text-fg ring-1 ring-inset ring-accent/30" : "text-muted hover:bg-panel-2 hover:text-fg",
              )}
            >
              <Icon size={17} className={active ? "text-accent" : undefined} aria-hidden />
              {t.nav[key]}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5" title={configured ? undefined : t.profile.noAccounts}>
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-panel-2 text-muted">
            <UserRound size={16} aria-hidden />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm text-fg">{user?.email ?? t.profile.guest}</div>
            <div className="truncate text-[11px] text-muted">{user ? t.profile.synced : t.profile.local}</div>
          </div>
          {user ? (
            <button type="button" onClick={() => void signOut()} aria-label={t.profile.signOut} title={t.profile.signOut} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-panel-2 hover:text-fg">
              <LogOut size={15} aria-hidden />
            </button>
          ) : configured ? (
            <Link href="/login" onClick={onNavigate} className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-fg-2 hover:border-accent/60 hover:text-fg">
              {t.profile.signIn}
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2 px-1">
          <div role="group" aria-label={t.language.label} className="flex rounded-lg border border-line p-0.5">
            {(["tr", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => set({ language: lang })}
                aria-pressed={language === lang}
                className={cn("rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold", language === lang ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => set({ theme: theme === "dark" ? "light" : "dark" })}
            aria-label={`${t.theme.label}: ${theme === "dark" ? t.theme.dark : t.theme.light}`}
            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-fg"
          >
            {theme === "dark" ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
          </button>
          <Link href="/help" onClick={onNavigate} aria-label={t.nav.help} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-fg">
            <CircleHelp size={15} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { t } = usePreferences();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-bg-2 lg:block">
        <Sidebar />
      </aside>

      <div className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo subtitle={t.brand.sub} />
        <button type="button" onClick={() => setOpen(true)} aria-label={t.nav.openMenu} aria-expanded={open} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-fg-2">
          <Menu size={18} aria-hidden />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label={t.nav.closeMenu} className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-bg-2">
            <button type="button" onClick={() => setOpen(false)} aria-label={t.nav.closeMenu} className="absolute right-3 top-5 grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-fg">
              <X size={18} aria-hidden />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
