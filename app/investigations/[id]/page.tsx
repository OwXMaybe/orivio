"use client";

import { AlertCircle, ArrowLeft, FileQuestion, LoaderCircle, Printer, RefreshCw, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CollectionsPanel, NotesPanel, SharePanel } from "@/components/account/report-panels";
import { Timeline } from "@/components/investigation/timeline";
import { useEngineStatus } from "@/components/investigation/use-engine-status";
import { useInvestigationRunner } from "@/components/investigation/use-investigation-runner";
import { ReportView } from "@/components/reports/report-view";
import { Card, CardHeader, EmptyState, buttonClass } from "@/components/ui/primitives";
import { deleteInvestigation, updateInvestigation, useInvestigations, useStoreReady } from "@/lib/database/investigations-store";
import { usePreferences } from "@/lib/i18n/preferences";

export default function InvestigationReportPage() {
  const { t } = usePreferences();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const investigation = useInvestigations().find((i) => i.id === id);
  const ready = useStoreReady();
  const runner = useInvestigationRunner();
  const { status } = useEngineStatus();

  if (!ready) return <p className="text-sm text-muted">{t.common.loading}</p>;
  if (!investigation) {
    return (
      <Card>
        <EmptyState icon={FileQuestion} title={t.report.notFound}>
          <Link href="/investigations" className={`${buttonClass.secondary} mt-4`}>{t.report.back}</Link>
        </EmptyState>
      </Card>
    );
  }

  const canRecheck = Boolean(status?.ai && status.search.length) && investigation.status !== "failed";
  // While a re-check streams, the timeline shows its live events; afterwards the saved ones.
  const events = runner.busy ? runner.events : investigation.events;
  const errorText = runner.error ? (t.errors[runner.error as keyof typeof t.errors] ?? t.errors.generic) : null;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href="/investigations" className={buttonClass.ghost}>
          <ArrowLeft size={15} aria-hidden /> {t.report.back}
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateInvestigation(investigation.id, { favorite: !investigation.favorite })}
            aria-pressed={investigation.favorite}
            className={buttonClass.secondary}
          >
            <Star size={15} className={investigation.favorite ? "fill-warn text-warn" : undefined} aria-hidden />
            {investigation.favorite ? t.report.unfavorite : t.report.favorite}
          </button>
          <button type="button" onClick={() => window.print()} className={buttonClass.secondary}>
            <Printer size={15} aria-hidden /> {t.report.print}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t.list.confirmDelete)) {
                deleteInvestigation(investigation.id);
                router.push("/investigations");
              }
            }}
            className={buttonClass.danger}
          >
            <Trash2 size={15} aria-hidden /> {t.report.delete}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <ReportView investigation={investigation} />
        <div className="no-print space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader title={t.assessment.recheckTitle} icon={RefreshCw} />
            <div className="space-y-3 p-4">
              <p className="text-xs leading-5 text-muted">{canRecheck ? t.assessment.recheckNote : t.assessment.recheckUnavailable}</p>
              <button
                type="button"
                disabled={!canRecheck || runner.busy}
                onClick={() => void runner.recheck(investigation)}
                className={`${buttonClass.primary} w-full`}
              >
                {runner.busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />}
                {runner.busy ? t.assessment.rechecking : t.assessment.recheck}
              </button>
              {errorText && (
                <p role="alert" className="flex gap-1.5 text-xs text-bad">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden /> {errorText}
                </p>
              )}
              {runner.result && !runner.persisted && <p className="text-xs text-warn">{t.investigate.notSaved}</p>}
            </div>
          </Card>
          <SharePanel investigation={investigation} />
          <NotesPanel investigationId={investigation.id} />
          <CollectionsPanel investigationId={investigation.id} />
          <Card>
            <CardHeader title={t.investigate.timeline} />
            <div className="p-4"><Timeline events={events} busy={runner.busy} /></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
