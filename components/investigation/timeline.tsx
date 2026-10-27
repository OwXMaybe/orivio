"use client";

import { CheckCircle2, CircleDashed, CircleSlash, LoaderCircle, XCircle } from "lucide-react";
import { formatTime } from "@/lib/i18n/format";
import { usePreferences } from "@/lib/i18n/preferences";
import { STAGES, type InvestigationEvent, type StageStatus } from "@/types/investigation";
import { cn } from "../ui/primitives";

const ICONS: Record<StageStatus | "pending", React.ReactNode> = {
  completed: <CheckCircle2 size={18} className="text-ok" aria-hidden />,
  skipped: <CircleSlash size={18} className="text-warn" aria-hidden />,
  failed: <XCircle size={18} className="text-bad" aria-hidden />,
  running: <LoaderCircle size={18} className="animate-spin text-accent" aria-hidden />,
  pending: <CircleDashed size={18} className="text-muted" aria-hidden />,
};

/**
 * Renders only what the engine reported. While a request is in flight, the
 * first stage without an event is marked as running — no percentages.
 */
export function Timeline({ events, busy }: { events: InvestigationEvent[]; busy: boolean }) {
  const { t, language } = usePreferences();
  const byStage = new Map(events.map((e) => [e.stage, e]));
  const firstOpen = STAGES.find((s) => !byStage.has(s));

  return (
    <ol className="space-y-0" aria-live="polite">
      {STAGES.map((stage, i) => {
        const event = byStage.get(stage);
        const status: StageStatus | "pending" = event?.status ?? (busy && stage === firstOpen ? "running" : "pending");
        const detail = event ? t.stageDetail[event.detail] : null;
        return (
          <li key={stage} className="relative flex gap-3 pb-4 last:pb-0">
            {i < STAGES.length - 1 && <span className="absolute left-[8.5px] top-6 h-[calc(100%-1.25rem)] w-px bg-line" aria-hidden />}
            <span className="relative z-10 mt-0.5 bg-panel">{ICONS[status]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={cn("text-sm", status === "pending" ? "text-muted" : "text-fg")}>{t.stage[stage]}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  {status === "pending" ? t.investigate.waiting : t.stageStatus[status]}
                  {event && ` · ${formatTime(event.at, language)}`}
                </span>
              </div>
              {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
