"use client";

import { useState } from "react";
import { usePreferences } from "@/lib/i18n/preferences";
import type { Evidence, EvidenceRelation } from "@/types/evidence";
import type { Source, SourceType } from "@/types/source";
import { SourceCard } from "../sources/source-card";

const TYPE_COLOR: Record<SourceType, string> = {
  fact_checker: "var(--accent)",
  academic: "var(--accent-2)",
  government: "#a78bfa",
  research_organization: "#38bdf8",
  news: "var(--warn)",
  other: "var(--muted)",
};

const RELATION_STROKE: Record<EvidenceRelation, { color: string; dash?: string }> = {
  supports: { color: "var(--ok)" },
  contradicts: { color: "var(--bad)" },
  provides_context: { color: "var(--accent-2)" },
  challenges_methodology: { color: "var(--warn)", dash: "6 3" },
};

const SIZE = 420;
const CENTER = SIZE / 2;
const RADIUS = 160;

/**
 * Claim in the centre, sources around it. Edges use evidence relations when
 * evidence exists; otherwise they are drawn as dashed "discovered" links.
 */
export function EvidenceMap({ claim, sources, evidence }: { claim: string; sources: Source[]; evidence: Evidence[] }) {
  const { t } = usePreferences();
  const [selected, setSelected] = useState<string | null>(null);
  const shown = sources.slice(0, 16);
  const relationOf = (id: string) => evidence.find((e) => e.sourceId === id)?.relation ?? null;
  const active = shown.find((s) => s.id === selected) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[420px]" role="img" aria-label={t.report.map}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
        {shown.map((s, i) => {
          const angle = (i / shown.length) * Math.PI * 2 - Math.PI / 2;
          const x = CENTER + Math.cos(angle) * RADIUS;
          const y = CENTER + Math.sin(angle) * RADIUS;
          const relation = relationOf(s.id);
          const stroke = relation ? RELATION_STROKE[relation] : { color: "var(--line-strong)", dash: "3 5" };
          const isActive = s.id === selected;
          return (
            <g key={s.id}>
              <line x1={CENTER} y1={CENTER} x2={x} y2={y} stroke={stroke.color} strokeDasharray={stroke.dash} strokeWidth={isActive ? 2 : 1.2} />
              <circle
                cx={x}
                cy={y}
                r={isActive ? 13 : 10}
                fill="var(--panel-2)"
                stroke={TYPE_COLOR[s.type]}
                strokeWidth={s.retrieval === "retrieved" ? 3 : 1.5}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${s.title} — ${t.sourceType[s.type]}`}
                aria-pressed={isActive}
                onClick={() => setSelected(isActive ? null : s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(isActive ? null : s.id);
                  }
                }}
              />
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" fill="var(--text-2)" pointerEvents="none" fontFamily="var(--font-mono)">
                {i + 1}
              </text>
            </g>
          );
        })}
        <circle cx={CENTER} cy={CENTER} r={44} fill="var(--panel)" stroke="var(--accent)" strokeWidth={2} />
        <foreignObject x={CENTER - 40} y={CENTER - 30} width={80} height={60}>
          <div className="flex h-full items-center justify-center text-center text-[9px] leading-tight text-fg-2">
            {claim.length > 70 ? `${claim.slice(0, 67)}…` : claim}
          </div>
        </foreignObject>
      </svg>

      <div className="min-w-0">
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          {(Object.keys(TYPE_COLOR) as SourceType[]).map((type) => (
            <li key={type} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: TYPE_COLOR[type] }} aria-hidden />
              {t.sourceType[type]}
            </li>
          ))}
          {(Object.keys(RELATION_STROKE) as EvidenceRelation[]).map((relation) => (
            <li key={relation} className="flex items-center gap-1.5">
              <svg width="20" height="4" aria-hidden>
                <line x1="0" y1="2" x2="20" y2="2" stroke={RELATION_STROKE[relation].color} strokeWidth="2" strokeDasharray={RELATION_STROKE[relation].dash} />
              </svg>
              {t.relation[relation]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="w-5 border-t border-dashed border-line-strong" aria-hidden />
            {t.report.discovered}
          </li>
        </ul>
        <p className="mb-3 text-xs leading-5 text-muted">{t.report.mapNote}</p>
        {active && <SourceCard source={active} expanded />}
      </div>
    </div>
  );
}
