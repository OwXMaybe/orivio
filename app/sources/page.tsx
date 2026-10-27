"use client";

import { BookMarked } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SourceCard } from "@/components/sources/source-card";
import { Card, EmptyState, PageHeader, cn } from "@/components/ui/primitives";
import { useInvestigations, useStoreReady } from "@/lib/database/investigations-store";
import { usePreferences } from "@/lib/i18n/preferences";
import { SOURCE_TYPES, type SourceType } from "@/types/source";

export default function SourceLibraryPage() {
  const { t } = usePreferences();
  const investigations = useInvestigations();
  const ready = useStoreReady();
  const [type, setType] = useState<SourceType | "all">("all");

  const all = useMemo(
    () => investigations.flatMap((inv) => inv.sources.map((source) => ({ source, investigation: inv }))),
    [investigations],
  );
  const [origin, setOrigin] = useState<"all" | "primary" | "secondary">("all");
  const shown = all.filter(
    (x) =>
      (type === "all" || x.source.type === type) &&
      (origin === "all" || (origin === "primary" ? x.source.primary === true : x.source.primary === false)),
  );
  const chip = (active: boolean) =>
    cn("rounded-full border px-3 py-1.5 text-xs transition", active ? "border-accent/60 bg-accent/10 text-fg" : "border-line text-muted hover:text-fg");

  return (
    <div>
      <PageHeader title={t.library.title} intro={t.library.intro} />
      <div role="group" aria-label={t.report.category} className="mb-2 flex flex-wrap gap-2">
        {(["all", ...SOURCE_TYPES] as const).map((value) => {
          const count = value === "all" ? all.length : all.filter((x) => x.source.type === value).length;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              aria-pressed={type === value}
              className={chip(type === value)}
            >
              {value === "all" ? t.library.all : t.sourceType[value]} <span className="font-mono text-muted">{count}</span>
            </button>
          );
        })}
      </div>
      <div role="group" aria-label={`${t.evidence.primary} / ${t.evidence.secondary}`} className="mb-2 flex flex-wrap gap-2">
        {(["all", "primary", "secondary"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setOrigin(value)} aria-pressed={origin === value} className={chip(origin === value)}>
            {value === "all" ? t.library.allOrigins : value === "primary" ? t.evidence.primary : t.evidence.secondary}
          </button>
        ))}
      </div>
      <p className="mb-4 text-[11px] text-muted">{t.library.primaryNote}</p>

      {!ready ? (
        <p className="text-sm text-muted">{t.common.loading}</p>
      ) : shown.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map(({ source, investigation }) => (
            <li key={`${investigation.id}-${source.id}`}>
              <SourceCard
                source={source}
                footer={
                  <Link href={`/investigations/${investigation.id}`} className="mt-3 block truncate border-t border-line pt-2 text-[11px] text-muted hover:text-accent">
                    {t.library.investigation}: {investigation.input}
                  </Link>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <Card><EmptyState icon={BookMarked} title={t.library.empty} /></Card>
      )}
    </div>
  );
}
