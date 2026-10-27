"use client";

import { ListChecks, Scale } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { usePreferences } from "@/lib/i18n/preferences";
import { VERDICTS } from "@/types/verdict";

export default function HelpPage() {
  const { t } = usePreferences();
  return (
    <div className="space-y-4">
      <PageHeader title={t.help.title} intro={t.help.intro} />
      <Card>
        <CardHeader title={t.help.method} icon={ListChecks} />
        <ol className="space-y-3 p-4 sm:p-5">
          {t.help.methodSteps.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm text-fg-2">
              <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
      </Card>
      <Card>
        <CardHeader title={t.help.scale} icon={Scale} />
        <div className="p-4 sm:p-5">
          <p className="mb-4 text-xs text-muted">{t.help.scaleNote}</p>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[14rem_1fr]">
            {VERDICTS.map((v) => (
              <div key={v} className="contents">
                <dt className="font-mono text-xs font-semibold tracking-wider text-fg">{t.verdict[v]}</dt>
                <dd className="text-fg-2">{t.help.verdictText[v]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>
    </div>
  );
}
