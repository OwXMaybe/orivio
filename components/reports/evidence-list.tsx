"use client";

import { ExternalLink } from "lucide-react";
import { usePreferences } from "@/lib/i18n/preferences";
import type { Evidence, EvidenceRelation } from "@/types/evidence";
import type { Source } from "@/types/source";
import { ExternalAnchor } from "../sources/source-card";
import { Badge } from "../ui/primitives";

const RELATION_TONE: Record<EvidenceRelation, "ok" | "bad" | "blue" | "warn"> = {
  supports: "ok",
  contradicts: "bad",
  provides_context: "blue",
  challenges_methodology: "warn",
};

/** Each passage links to its original page and to its numbered reference. */
export function EvidenceList({ evidence, sources, empty }: { evidence: Evidence[]; sources: Source[]; empty: string }) {
  const { t } = usePreferences();
  if (!evidence.length) {
    return <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-xs leading-5 text-muted">{empty}</p>;
  }
  const indexOf = new Map(sources.map((s, i) => [s.id, i + 1]));
  const byId = new Map(sources.map((s) => [s.id, s]));

  return (
    <ul className="space-y-3">
      {evidence.map((e) => {
        const source = byId.get(e.sourceId);
        return (
          <li key={e.id} className="rounded-lg border border-line bg-panel-2 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={RELATION_TONE[e.relation]}>{t.relation[e.relation]}</Badge>
              {e.round > 1 && <Badge>{`${t.evidence.round} ${e.round}`}</Badge>}
            </div>
            <blockquote className="mt-3 border-l-2 border-accent/60 pl-3 text-sm italic leading-6 text-fg">“{e.quote}”</blockquote>
            {source && (
              <ExternalAnchor href={source.url} className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                [{indexOf.get(source.id)}] {source.publisher}
                <ExternalLink size={11} aria-hidden />
              </ExternalAnchor>
            )}
            <p className="mt-2 text-sm leading-6 text-fg-2">{e.explanation}</p>
            {e.limitations && (
              <p className="mt-1 text-xs leading-5 text-muted">
                <span className="font-semibold">{t.evidence.limitations}:</span> {e.limitations}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
