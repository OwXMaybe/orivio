"use client";

import { useMemo } from "react";
import { BookOpenCheck, Compass, FileText, FlaskConical, Globe2, History, Microscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InvestigationForm } from "@/components/investigation/investigation-form";
import { InvestigationRow } from "@/components/investigation/investigation-row";
import { setPendingInput } from "@/components/investigation/pending-input";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { useInvestigations, useStoreReady } from "@/lib/database/investigations-store";
import { EXAMPLE_CLAIMS } from "@/lib/explore/examples";
import { usePreferences } from "@/lib/i18n/preferences";
import { computeStats } from "@/lib/investigation-stats";
import type { Language } from "@/types/investigation";

function StatCard({ label, value, hint, icon: Icon }: { label: string; value: number | null; hint?: string; icon: typeof FlaskConical }) {
  return (
    <Card as="div" className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        <Icon size={16} className="text-accent" aria-hidden />
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold text-fg">{value ?? "—"}</div>
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </Card>
  );
}

export default function DashboardPage() {
  const { t, language } = usePreferences();
  const router = useRouter();
  const investigations = useInvestigations();
  const ready = useStoreReady();
  // Recomputed only when the list changes, not on every render.
  const stats = useMemo(() => computeStats(investigations), [investigations]);

  const start = (input: string, researchLanguage: Language) => {
    setPendingInput(input, researchLanguage);
    router.push("/investigate");
  };

  return (
    <div className="space-y-6">
      <section className="grid-bg overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="p-5 sm:p-8">
          <div className="kicker flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {t.brand.tagline}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t.dashboard.welcome}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t.dashboard.intro}</p>
          <div className="mt-6">
            <InvestigationForm onSubmit={start} large />
          </div>
        </div>
      </section>

      <section aria-labelledby="stats-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="stats-title" className="text-sm font-semibold text-fg">{t.dashboard.statsTitle}</h2>
          <span className="text-[11px] text-muted">{t.dashboard.statsNote}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t.dashboard.total} value={ready ? stats.total : null} icon={Microscope} />
          <StatCard label={t.dashboard.verified} value={ready ? stats.verifiedClaims : null} hint={t.dashboard.verifiedHint} icon={BookOpenCheck} />
          <StatCard label={t.dashboard.analyzed} value={ready ? stats.sourcesRetrieved : null} hint={t.dashboard.analyzedHint} icon={Globe2} />
          <StatCard label={t.dashboard.reports} value={ready ? stats.reports : null} icon={FileText} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title={t.dashboard.recent}
            icon={History}
            action={investigations.length > 0 && <Link href="/investigations" className="text-xs text-accent hover:underline">{t.dashboard.viewAll}</Link>}
          />
          {!ready ? (
            <p className="p-5 text-sm text-muted">{t.common.loading}</p>
          ) : investigations.length ? (
            <ul>{investigations.slice(0, 5).map((inv) => <InvestigationRow key={inv.id} investigation={inv} />)}</ul>
          ) : (
            <EmptyState icon={History} title={t.dashboard.noRecent} />
          )}
        </Card>

        <Card>
          <CardHeader title={t.dashboard.explore} icon={Compass} action={<Link href="/explore" className="text-xs text-accent hover:underline">{t.dashboard.viewAll}</Link>} />
          <p className="px-4 pt-3 text-[11px] text-muted sm:px-5">{t.dashboard.exploreNote}</p>
          <ul className="space-y-2 p-4 sm:p-5">
            {EXAMPLE_CLAIMS.slice(0, 4).map((ex) => (
              <li key={ex.en}>
                <button
                  type="button"
                  onClick={() => start(ex[language], language)}
                  className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-left text-sm text-fg-2 transition hover:border-accent/50 hover:text-fg"
                >
                  <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-muted">{t.category[ex.category]}</span>
                  {ex[language]}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
