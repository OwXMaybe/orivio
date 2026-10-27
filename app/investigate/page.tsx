"use client";

import { AlertCircle, CheckCircle2, Microscope } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { InvestigationForm } from "@/components/investigation/investigation-form";
import { takePendingInput } from "@/components/investigation/pending-input";
import { Timeline } from "@/components/investigation/timeline";
import { useInvestigationRunner } from "@/components/investigation/use-investigation-runner";
import { ReportView } from "@/components/reports/report-view";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { usePreferences } from "@/lib/i18n/preferences";

export default function InvestigatePage() {
  const { t, set } = usePreferences();
  const runner = useInvestigationRunner();
  const [initial, setInitial] = useState("");
  const [formKey, setFormKey] = useState(0);
  const started = useRef(false);
  const { run } = runner;

  // Pick up an input handed over from the dashboard or Explore and start it once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const pending = takePendingInput();
    if (pending) {
      setInitial(pending.input);
      setFormKey((k) => k + 1);
      set({ researchLanguage: pending.researchLanguage });
      void run(pending.input, pending.researchLanguage);
    }
  }, [run, set]);

  const errorText = runner.error ? (t.errors[runner.error as keyof typeof t.errors] ?? t.errors.generic) : null;

  return (
    <div>
      <PageHeader title={t.investigate.title} intro={t.investigate.intro} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-4 sm:p-5">
          <InvestigationForm key={formKey} initialValue={initial} onSubmit={(input, lang) => void runner.run(input, lang)} busy={runner.busy} />
        </Card>
        <Card>
          <CardHeader title={t.investigate.timeline} icon={Microscope} />
          <div className="p-4 sm:p-5">
            <Timeline events={runner.events} busy={runner.busy} />
          </div>
        </Card>
      </div>

      {errorText && (
        <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
          <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden />
          {errorText}
        </div>
      )}

      {runner.result && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-sm">
            {runner.persisted ? (
              <span className="flex items-center gap-2 text-ok"><CheckCircle2 size={16} aria-hidden />{t.investigate.saved}</span>
            ) : (
              <span className="flex items-center gap-2 text-warn"><AlertCircle size={16} aria-hidden />{t.investigate.notSaved}</span>
            )}
            <Link href={`/investigations/${runner.result.id}`} className="text-accent hover:underline">{t.investigate.openReport}</Link>
          </div>
          <ReportView investigation={runner.result} />
        </div>
      )}
    </div>
  );
}
