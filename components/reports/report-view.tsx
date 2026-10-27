"use client";

import { AlertTriangle, BookOpen, FileSearch, GitCompare, History, ListChecks, Network, Scale, ShieldAlert } from "lucide-react";
import { describeLimitation, formatDate } from "@/lib/i18n/format";
import { usePreferences } from "@/lib/i18n/preferences";
import type { Investigation } from "@/types/investigation";
import { SourceCard, ExternalAnchor } from "../sources/source-card";
import { Badge, Card, CardHeader } from "../ui/primitives";
import { ClaimAssessment, ConfidenceBadge, CorrectionHistory, VerdictBadge } from "./assessment";
import { EvidenceList } from "./evidence-list";
import { EvidenceMap } from "./evidence-map";

function Pending({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-xs leading-5 text-muted">{text}</p>;
}

function Section({ n, title, icon, children }: { n?: number; title: string; icon?: Parameters<typeof CardHeader>[0]["icon"]; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={n ? `${String(n).padStart(2, "0")} · ${title}` : title} icon={icon} />
      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  );
}

export function ReportView({ investigation: inv }: { investigation: Investigation }) {
  const { t, language } = usePreferences();
  const verifiable = inv.claims.filter((c) => c.verifiable);
  const retrieved = inv.sources.filter((s) => s.retrieval === "retrieved");
  const supporting = inv.evidence.filter((e) => e.relation === "supports");
  const contradicting = inv.evidence.filter((e) => e.relation === "contradicts");
  const contextual = inv.evidence.filter((e) => e.relation === "provides_context" || e.relation === "challenges_methodology");
  const evidenceRan = inv.events.some((e) => e.stage === "evidence_analyzed" && e.status === "completed");
  // Why a section is empty, so an empty list is never mistaken for "nothing exists".
  const emptyEvidence = evidenceRan ? t.evidence.none : !retrieved.length ? t.evidence.noSources : inv.mode.ai === "heuristic" ? t.evidence.noAi : t.report.pendingPhase3;
  const sourceNumber = new Map(inv.sources.map((s, i) => [s.id, i + 1]));
  const independenceLabel = (s: (typeof inv.sources)[number]) => {
    if (!s.independenceGroup) return "—";
    if (s.independenceGroup === s.id) return t.evidence.independent;
    return `${t.evidence.copyOf} #${sourceNumber.get(s.independenceGroup) ?? "?"}`;
  };
  const originLabel = (s: (typeof inv.sources)[number]) =>
    s.primary === null ? t.evidence.unevaluated : s.primary ? t.evidence.primary : t.evidence.secondary;
  const mainClaim = inv.claims.find((c) => c.verifiable) ?? inv.claims[0];
  const verdict = mainClaim ? inv.verdicts.find((v) => v.claimId === mainClaim.id) : undefined;
  const stancesFor = (queryIds: string[]) =>
    [...new Set(inv.queries.filter((q) => queryIds.includes(q.id)).map((q) => q.stance))];

  return (
    <div className="space-y-4">
      {/* 1–5: header block */}
      <Card className="p-5 sm:p-6">
        <div className="kicker">{t.report.claim}</div>
        <h2 className="mt-2 break-words text-xl font-semibold leading-snug text-fg sm:text-2xl">{inv.inputUrl ?? inv.input}</h2>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="kicker">{t.report.category}</dt>
            <dd className="mt-1 text-fg-2">{t.category[inv.primaryCategory]}</dd>
          </div>
          <div>
            <dt className="kicker">{t.report.date}</dt>
            <dd className="mt-1 text-fg-2">{formatDate(inv.createdAt, language, true)}</dd>
          </div>
          <div>
            <dt className="kicker">{t.report.verdict}</dt>
            <dd className="mt-1"><VerdictBadge value={verdict?.value ?? null} /></dd>
          </div>
          <div>
            <dt className="kicker">{t.report.confidence}</dt>
            <dd className="mt-1"><ConfidenceBadge verdict={verdict} /></dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted">
          <span>{t.report.engine}:</span>
          <Badge>{inv.mode.ai === "heuristic" ? t.report.aiHeuristic : inv.mode.ai}</Badge>
          <Badge>{inv.mode.search ?? t.report.noSearch}</Badge>
          <Badge tone="warn">{t.status[inv.status]}</Badge>
        </div>
      </Card>

      <Section n={6} title={t.report.summary} icon={FileSearch}>
        <p className="text-sm leading-6 text-fg-2">
          {t.report.summaryText(inv.claims.length, verifiable.length, inv.sources.length, retrieved.length, inv.evidence.length, inv.rounds, inv.verdicts.length)}
        </p>
      </Section>

      <Section n={7} title={t.report.investigated} icon={ListChecks}>
        <ol className="space-y-4">
          {inv.claims.map((claim, i) => {
            const queries = inv.queries.filter((q) => q.claimId === claim.id);
            return (
              <li key={claim.id} className="rounded-lg border border-line bg-panel-2 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs text-muted">#{i + 1}</span>
                  <Badge>{t.kind[claim.kind]}</Badge>
                  <Badge tone="blue">{t.category[claim.category]}</Badge>
                  <Badge tone={claim.verifiable ? "accent" : "neutral"}>{claim.verifiable ? t.report.verifiable : t.report.notVerifiable}</Badge>
                </div>
                <p className="mt-2 text-sm text-fg">{claim.text}</p>
                {claim.context && <p className="mt-1 text-xs text-muted">{claim.context}</p>}
                {claim.highImpact && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
                    <ShieldAlert size={14} aria-hidden /> {t.report.highImpact}
                  </p>
                )}
                {queries.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-xs">
                      <thead className="text-muted">
                        <tr>
                          <th className="py-1 pr-3 font-medium">{t.report.stance}</th>
                          <th className="py-1 pr-3 font-medium">{t.report.question}</th>
                          <th className="py-1 font-medium">{t.report.query}</th>
                        </tr>
                      </thead>
                      <tbody className="text-fg-2">
                        {queries.map((q) => (
                          <tr key={q.id} className="border-t border-line">
                            <td className="py-1.5 pr-3">{t.stance[q.stance]}</td>
                            <td className="py-1.5 pr-3">{q.question}</td>
                            <td className="py-1.5 font-mono">{q.query}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Section>

      {evidenceRan && <p className="px-1 text-[11px] text-muted">{t.evidence.quoteNote}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section n={8} title={t.report.supporting}>
          <EvidenceList evidence={supporting} sources={inv.sources} empty={emptyEvidence} />
        </Section>
        <Section n={9} title={t.report.contradicting}>
          <EvidenceList evidence={contradicting} sources={inv.sources} empty={emptyEvidence} />
        </Section>
      </div>

      <Section n={10} title={t.report.comparison} icon={GitCompare}>
        {inv.sources.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">#</th>
                  <th className="py-1 pr-3 font-medium">{t.evidence.source}</th>
                  <th className="py-1 pr-3 font-medium">{t.report.category}</th>
                  <th className="py-1 pr-3 font-medium">{t.report.foundVia}</th>
                  <th className="py-1 pr-3 font-medium">{t.evidence.primary} / {t.evidence.secondary}</th>
                  <th className="py-1 pr-3 font-medium">{t.evidence.independence}</th>
                  <th className="py-1 font-medium">{t.report.published}</th>
                </tr>
              </thead>
              <tbody className="text-fg-2">
                {inv.sources.map((s, i) => (
                  <tr key={s.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3 font-mono">{i + 1}</td>
                    <td className="py-1.5 pr-3">{s.publisher}</td>
                    <td className="py-1.5 pr-3">{t.sourceType[s.type]}</td>
                    <td className="py-1.5 pr-3">{stancesFor(s.queryIds).map((st) => t.stance[st]).join(", ")}</td>
                    <td className="py-1.5 pr-3">{originLabel(s)}</td>
                    <td className="py-1.5 pr-3">{independenceLabel(s)}</td>
                    <td className="py-1.5">{formatDate(s.publishedAt, language) ?? t.report.unknownDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-muted">{t.report.foundViaNote}</p>
            {inv.contradictions.map((c) => {
              const claim = inv.claims.find((cl) => cl.id === c.claimId);
              return (
                <div key={c.claimId} className="mt-4 rounded-lg border border-warn/40 bg-warn/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-warn">{t.evidence.conflict}</div>
                  {claim && <p className="mt-1 text-xs text-muted">{claim.text}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.factors.map((f) => <Badge key={f} tone="warn">{t.factor[f]}</Badge>)}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-fg-2">{c.explanation}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <Pending text={t.report.noSources} />
        )}
      </Section>

      {inv.sources.length > 0 && mainClaim && (
        <Section title={t.report.map} icon={Network}>
          <EvidenceMap claim={mainClaim.text} sources={inv.sources} evidence={inv.evidence} />
        </Section>
      )}

      <Section n={11} title={t.report.missing}>
        <EvidenceList evidence={contextual} sources={inv.sources} empty={emptyEvidence} />
      </Section>

      <Section n={12} title={t.report.limitations} icon={AlertTriangle}>
        {inv.limitations.length ? (
          <ul className="space-y-2">
            {inv.limitations.map((code) => (
              <li key={code} className="flex gap-2 text-sm text-fg-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                {describeLimitation(code, t)}
              </li>
            ))}
          </ul>
        ) : (
          <Pending text={t.report.noLimitations} />
        )}
      </Section>

      <Section n={13} title={t.report.assessment} icon={Scale}>
        {inv.verdicts.length ? (
          <div className="space-y-3">
            {inv.claims
              .filter((c) => inv.verdicts.some((v) => v.claimId === c.id))
              .map((c) => <ClaimAssessment key={c.id} claim={c} verdict={inv.verdicts.find((v) => v.claimId === c.id)} />)}
          </div>
        ) : (
          <Pending text={t.report.noVerdictText} />
        )}
      </Section>

      <Section n={14} title={t.report.references} icon={BookOpen}>
        {inv.sources.length ? (
          <ol className="grid gap-3 md:grid-cols-2">
            {inv.sources.map((s, i) => (
              <li key={s.id} id={`ref-${i + 1}`} className="flex scroll-mt-20 gap-2">
                <span className="mt-4 font-mono text-xs text-muted">{i + 1}.</span>
                <div className="min-w-0 flex-1"><SourceCard source={s} expanded /></div>
              </li>
            ))}
          </ol>
        ) : (
          <Pending text={t.report.noSources} />
        )}
      </Section>

      <Card>
        <CardHeader title={t.report.history} icon={History} />
        <div className="p-4 sm:p-5"><CorrectionHistory investigation={inv} /></div>
      </Card>

      {/* Plain reference list for print/PDF where cards are heavy. */}
      <div className="hidden print:block">
        {inv.sources.map((s, i) => (
          <p key={s.id} className="text-xs">
            [{i + 1}] {s.title} — {s.publisher}. <ExternalAnchor href={s.url}>{s.url}</ExternalAnchor>
          </p>
        ))}
      </div>
    </div>
  );
}
