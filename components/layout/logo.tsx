import Link from "next/link";

export function Logo({ subtitle }: { subtitle: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <svg viewBox="0 0 64 64" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" className="fill-panel-2 stroke-line" strokeWidth="2" />
        <circle cx="32" cy="32" r="16" fill="none" className="stroke-accent" strokeWidth="4" />
        <circle cx="32" cy="32" r="5.5" className="fill-accent-2" />
        <path d="M43.5 43.5l8 8" className="stroke-accent" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-[0.18em] text-fg">ORIVIO</span>
        <span className="block font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">{subtitle}</span>
      </span>
    </Link>
  );
}
