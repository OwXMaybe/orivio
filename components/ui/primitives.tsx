import type { LucideIcon } from "lucide-react";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, children, as: Tag = "section" }: { className?: string; children: React.ReactNode; as?: "section" | "div" | "article" }) {
  return <Tag className={cn("rounded-xl border border-line bg-panel", className)}>{children}</Tag>;
}

export function CardHeader({ title, icon: Icon, action }: { title: string; icon?: LucideIcon; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        {Icon && <Icon size={16} className="text-accent" aria-hidden />}
        {title}
      </h2>
      {action}
    </div>
  );
}

type Tone = "neutral" | "accent" | "blue" | "ok" | "warn" | "bad";
const TONES: Record<Tone, string> = {
  neutral: "border-line-strong text-fg-2",
  accent: "border-accent/40 bg-accent/10 text-accent",
  blue: "border-accent-2/40 bg-accent-2/10 text-accent-2",
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  bad: "border-bad/40 bg-bad/10 text-bad",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, intro, kicker, action }: { title: string; intro?: string; kicker?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker && <div className="kicker mb-2">{kicker}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
        {intro && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{intro}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-muted">
        <Icon size={20} aria-hidden />
      </div>
      <p className="max-w-md text-sm text-fg-2">{title}</p>
      {children}
    </div>
  );
}

export const buttonClass = {
  primary: "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40",
  secondary: "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm text-fg-2 transition hover:border-accent/60 hover:text-fg disabled:opacity-40",
  ghost: "inline-flex items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-panel-2 hover:text-fg",
  danger: "inline-flex items-center justify-center gap-2 rounded-lg border border-bad/40 px-3 py-2 text-sm text-bad transition hover:bg-bad/10",
};

export const inputClass =
  "w-full rounded-lg border border-line-strong bg-bg-2 px-3 py-2 text-sm text-fg outline-none placeholder:text-muted focus:border-accent";
