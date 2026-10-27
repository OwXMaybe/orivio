"use client";

import { ArrowRight, Info, ShieldAlert } from "lucide-react";
import { formatDate } from "@/lib/i18n/format";
import { usePreferences } from "@/lib/i18n/preferences";
import type { Claim } from "@/types/claim";
import type { Investigation } from "@/types/investigation";
import type { ConfidenceFactor, EvidenceConfidence, Verdict, VerdictValue } from "@/types/verdict";
import { Badge } from "../ui/primitives";

const VERDICT_TONE: Record<VerdictValue, "ok" | "warn" | "bad" | "neutral"> = {
  true: "ok", mostly_true: "ok", misleading: "warn", mostly_false: "bad", false: "bad",
  insufficient_evidence: "neutral", unverifiable: "neutral",
};
const CONFIDENCE_TONE: Record<EvidenceConfidence, "ok" | "warn" | "bad"> = { high: "ok", medium: "warn", low: "bad" };

export function VerdictBadge({ value }: { value: VerdictValue | null }) {
  const { t } = usePreferences();
  return value ? <Badge tone={VERDICT_TONE[value]}>{t.verdict[value]}</Badge> : <Badge>{t.report.noVerdict}</Badge>;
}

export function ConfidenceBadge({ verdict }: { verdict: Verdict | undefined }) {
  const { t } = usePreferences();
  if (!verdict) return <Badge>{t.report.noVerdict}</Badge>;
  if (!verdict.confidence) return <Badge>{t.assessment.notApplicable}</Badge>;
  return <Badge tone={CONFIDENCE_TONE[verdict.confidence]}>{t.assessment.confidence[verdict.confidence]}</Badge>;
}

/** Renders "[3]" citations as links to the matching reference. */
export function CitedText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        return m ? (
          <a key={i} href={`#ref-${m[1]}`} className="font-mono text-xs text-accent hover:underline">{part}</a>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

function factorText(f: ConfidenceFactor, t: ReturnType<typeof usePreferences>["t"]): string {
  switch (f.code) {
    case "one_sided":
    case "high_impact":
      return t.assessment.factor[f.code]();
    default:
      return t.assessment.factor[f.code](f.value);
  }
}

export function ClaimAssessment({ claim, verdict }: { claim: Claim; verdict: Verdict | undefined }) {
  const { t } = usePreferences();
  return (
    <article className="rounded-lg border border-line bg-panel-2 p-4">
      <p className="text-sm text-fg">{claim.text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">{t.report.verdict}: <VerdictBadge value={verdict?.value ?? null} /></span>
        <span className="flex items-center gap-1.5">{t.report.confidence}: <ConfidenceBadge verdict={verdict} /></span>
      </div>
      {verdict?.explanation && (
        <p className="mt-3 text-sm leading-6 text-fg-2"><CitedText text={verdict.explanation} /></p>
      )}
      {verdict?.rule && (
        <p className="mt-3 flex gap-2 text-sm leading-6 text-fg-2">
          <Info size={15} className="mt-1 shrink-0 text-muted" aria-hidden />
          {t.assessment.rule[verdict.rule]}
          {verdict.rule === "not_verifiable" && claim.verifiabilityReason && !claim.verifiabilityReason.startsWith("heuristic_") ? ` ${claim.verifiabilityReason}` : ""}
        </p>
      )}
      {verdict?.adjustedFrom && verdict.rule !== "uncited" && (
        <p className="mt-2 text-xs leading-5 text-warn">{t.assessment.adjusted(t.verdict[verdict.adjustedFrom])}</p>
      )}
      {claim.highImpact && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-warn"><ShieldAlert size={14} aria-hidden /> {t.report.highImpact}</p>
      )}
      {verdict && verdict.confidenceFactors.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">{t.assessment.factors}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-5 text-fg-2">
            {verdict.confidenceFactors.map((f) => <li key={f.code}>{factorText(f, t)}</li>)}
          </ul>
        </div>
      )}
    </article>
  );
}

function VerdictLine({ claims, verdicts }: { claims: Claim[]; verdicts: Verdict[] }) {
  const { t } = usePreferences();
  return (
    <ul className="mt-2 space-y-1">
      {verdicts.map((v) => (
        <li key={v.claimId} className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
          <span className="min-w-0 truncate">{claims.find((c) => c.id === v.claimId)?.text}</span>
          <VerdictBadge value={v.value} />
          {v.confidence && <span className="text-muted">({t.assessment.confidence[v.confidence]})</span>}
        </li>
      ))}
    </ul>
  );
}

/** Shows the initial assessment and every revision; earlier results are never hidden. */
export function CorrectionHistory({ investigation: inv }: { investigation: Investigation }) {
  const { t, language } = usePreferences();
  const initial = inv.revisions[0]?.previousVerdicts ?? inv.verdicts;
  const label = (vs: Verdict[], claimId: string) => {
    const v = vs.find((x) => x.claimId === claimId);
    return v ? `${t.verdict[v.value]}${v.confidence ? ` · ${t.assessment.confidence[v.confidence]}` : ""}` : t.assessment.noVerdict;
  };

  if (!initial.length && !inv.revisions.length) {
    return <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-xs leading-5 text-muted">{t.report.historyEmpty}</p>;
  }

  return (
    <ol className="space-y-3">
      <li className="rounded-lg border border-line bg-panel-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-fg">{t.assessment.initial}</span>
          <span className="font-mono text-[11px] text-muted">{formatDate(inv.createdAt, language, true)}</span>
        </div>
        <VerdictLine claims={inv.claims} verdicts={initial} />
      </li>
      {inv.revisions.map((r) => {
        const claimIds = [...new Set([...r.previousVerdicts, ...r.newVerdicts].map((v) => v.claimId))];
        return (
          <li key={r.revision} className={`rounded-lg border p-4 ${r.changed ? "border-warn/40 bg-warn/5" : "border-line bg-panel-2"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-fg">
                {t.assessment.revision(r.revision)}
                <Badge tone={r.changed ? "warn" : "neutral"}>{r.changed ? t.assessment.changed : t.assessment.unchanged}</Badge>
              </span>
              <span className="font-mono text-[11px] text-muted">{formatDate(r.createdAt, language, true)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{t.assessment.newFound(r.newSourceIds.length, r.newEvidenceIds.length)}</p>
            <ul className="mt-2 space-y-1">
              {claimIds.map((id) => {
                const before = label(r.previousVerdicts, id);
                const after = label(r.newVerdicts, id);
                return (
                  <li key={id} className="text-xs text-fg-2">
                    <span className="block truncate text-muted">{inv.claims.find((c) => c.id === id)?.text}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={before !== after ? "line-through decoration-muted" : undefined}>{before}</span>
                      {before !== after && <><ArrowRight size={12} aria-hidden /><span className="font-semibold text-fg">{after}</span></>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
