"use client";

import { ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/i18n/format";
import { usePreferences } from "@/lib/i18n/preferences";
import type { Source } from "@/types/source";
import { Badge } from "../ui/primitives";

const RETRIEVAL_TONE = { retrieved: "ok", failed: "warn", blocked: "bad", not_attempted: "neutral" } as const;

/** Safe external link: only http(s) URLs are rendered as links. */
export function ExternalAnchor({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  if (!/^https?:\/\//i.test(href)) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {children}
    </a>
  );
}

export function SourceCard({ source, footer, expanded = false }: { source: Source; footer?: React.ReactNode; expanded?: boolean }) {
  const { t, language } = usePreferences();
  return (
    <article className="rounded-lg border border-line bg-panel-2 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="blue">{t.sourceType[source.type]}</Badge>
        <Badge tone={RETRIEVAL_TONE[source.retrieval]}>{t.retrieval[source.retrieval]}</Badge>
        {source.primary !== null && <Badge tone="accent">{source.primary ? t.evidence.primary : t.evidence.secondary}</Badge>}
      </div>
      <ExternalAnchor href={source.url} className="mt-2 flex items-start gap-1.5 text-sm font-medium text-fg hover:text-accent">
        <span className="min-w-0 break-words">{source.title}</span>
        <ExternalLink size={13} className="mt-1 shrink-0" aria-hidden />
      </ExternalAnchor>
      <div className="mt-1 text-xs text-muted">
        {source.publisher}
        {source.author && ` · ${source.author}`}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-muted">
        <dt>{t.report.published}</dt>
        <dd className="text-fg-2">{formatDate(source.publishedAt, language) ?? t.report.unknownDate}</dd>
        <dt>{t.report.accessed}</dt>
        <dd className="text-fg-2">{formatDate(source.accessedAt, language, true)}</dd>
        <dt>{t.report.provider}</dt>
        <dd className="font-mono text-fg-2">{source.provider}</dd>
      </dl>
      {source.snippet && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">{t.report.snippetNote}</div>
          <p className="mt-1 text-xs leading-5 text-fg-2">{source.snippet}</p>
        </div>
      )}
      {source.evaluationNotes && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">{t.evidence.evaluation}</div>
          <p className="mt-1 text-xs leading-5 text-fg-2">{source.evaluationNotes}</p>
        </div>
      )}
      {expanded && source.excerpt && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted">{t.report.excerpt}</summary>
          <p className="mt-2 max-h-60 overflow-auto whitespace-pre-line rounded-md border border-line bg-bg-2 p-3 text-xs leading-5 text-fg-2">{source.excerpt}</p>
        </details>
      )}
      {source.retrievalError && <p className="mt-2 text-[11px] text-warn">{source.retrievalError}</p>}
      {footer}
    </article>
  );
}
