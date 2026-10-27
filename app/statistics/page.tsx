"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { useInvestigations, useStoreReady } from "@/lib/database/investigations-store";
import { usePreferences } from "@/lib/i18n/preferences";
import { computeStats } from "@/lib/investigation-stats";
import { CLAIM_CATEGORIES } from "@/types/claim";
import { VERDICTS } from "@/types/verdict";

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-xs">
          <span className="truncate text-fg-2">{r.label}</span>
          <span className="h-2 rounded-full bg-panel-2" aria-hidden>
            <span className="block h-2 rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-mono text-fg">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default function StatisticsPage() {
  const { t, language } = usePreferences();
  const investigations = useInvestigations();
  const ready = useStoreReady();
  // Recomputed only when the list changes, not on every render.
  const stats = useMemo(() => computeStats(investigations), [investigations]);
  const maxDay = Math.max(1, ...stats.perDay.map((d) => d.count));
  const verdictRows = VERDICTS.filter((v) => stats.byVerdict[v]).map((v) => ({ label: t.verdict[v], value: stats.byVerdict[v] ?? 0 }));

  return (
    <div>
      <PageHeader title={t.stats.title} intro={t.stats.intro} />
      {!ready ? (
        <p className="text-sm text-muted">{t.common.loading}</p>
      ) : !investigations.length ? (
        <Card><EmptyState icon={BarChart3} title={t.stats.empty} /></Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              [t.dashboard.total, stats.total],
              [t.stats.sourcesUsed, stats.sourcesDiscovered],
              [t.stats.retrieved, stats.sourcesRetrieved],
            ].map(([label, value]) => (
              <Card as="div" key={String(label)} className="p-4">
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-2 font-mono text-2xl font-semibold text-fg">{value}</div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={t.stats.byCategory} />
              <div className="p-4 sm:p-5">
                <Bars rows={CLAIM_CATEGORIES.filter((c) => stats.byCategory[c]).map((c) => ({ label: t.category[c], value: stats.byCategory[c] ?? 0 }))} />
              </div>
            </Card>
            <Card>
              <CardHeader title={t.stats.byVerdict} />
              <div className="p-4 sm:p-5">
                {verdictRows.length ? <Bars rows={verdictRows} /> : <p className="text-xs text-muted">{t.stats.noVerdicts}</p>}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title={t.stats.overTime} />
            <div className="p-4 sm:p-5">
              <div className="flex h-32 items-end gap-1" role="img" aria-label={t.stats.overTime}>
                {stats.perDay.map((d) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${new Date(d.day).toLocaleDateString(language)}: ${d.count}`}>
                    <span className="font-mono text-[10px] text-muted">{d.count || ""}</span>
                    <span className="w-full rounded-t bg-accent-2/70" style={{ height: `${(d.count / maxDay) * 96}px`, minHeight: d.count ? 4 : 1 }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] text-muted">
                <span>{new Date(stats.perDay[0].day).toLocaleDateString(language, { day: "numeric", month: "short" })}</span>
                <span>{new Date(stats.perDay[stats.perDay.length - 1].day).toLocaleDateString(language, { day: "numeric", month: "short" })}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
