"use client";

import { ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/i18n/format";
import { usePreferences } from "@/lib/i18n/preferences";
import type { Investigation } from "@/types/investigation";
import { Badge } from "../ui/primitives";

export function InvestigationRow({ investigation: inv, actions }: { investigation: Investigation; actions?: React.ReactNode }) {
  const { t, language } = usePreferences();
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
      <Link href={`/investigations/${inv.id}`} className="group min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {inv.favorite && <Star size={13} className="shrink-0 fill-warn text-warn" aria-label={t.report.favorite} />}
          <span className="truncate text-sm text-fg group-hover:text-accent">{inv.inputUrl ?? inv.input}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>{formatDate(inv.createdAt, language, true)}</span>
          <Badge>{t.category[inv.primaryCategory]}</Badge>
          <Badge tone={inv.status === "failed" ? "bad" : "warn"}>{t.status[inv.status]}</Badge>
          <span>{inv.claims.length} {t.list.claims} · {inv.sources.length} {t.list.sources}</span>
        </div>
      </Link>
      {actions}
      <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
    </li>
  );
}
