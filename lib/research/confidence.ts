import type { Claim } from "@/types/claim";
import type { Evidence } from "@/types/evidence";
import type { Source, SourceType } from "@/types/source";
import type { ConfidenceFactor, EvidenceConfidence } from "@/types/verdict";

const QUALITY_TYPES: SourceType[] = ["academic", "government", "research_organization", "fact_checker"];

export type ConfidenceResult = { confidence: EvidenceConfidence; factors: ConfidenceFactor[] };

/**
 * Rates the evidence base, not the claim. Computed with fixed rules so the
 * same evidence always gets the same confidence, independent of the AI.
 */
export function computeConfidence(claim: Claim, evidence: Evidence[], sources: Source[]): ConfidenceResult {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const direct = evidence.filter((e) => e.claimId === claim.id && (e.relation === "supports" || e.relation === "contradicts"));

  // One entry per independent group, remembering which sides it took and what it contains.
  const groups = new Map<string, { supports: boolean; contradicts: boolean; quality: boolean; primary: boolean }>();
  const directSources = new Set<string>();
  for (const e of direct) {
    const source = byId.get(e.sourceId);
    const key = source?.independenceGroup ?? e.sourceId;
    directSources.add(e.sourceId);
    const g = groups.get(key) ?? { supports: false, contradicts: false, quality: false, primary: false };
    if (e.relation === "supports") g.supports = true;
    else g.contradicts = true;
    if (source && QUALITY_TYPES.includes(source.type)) g.quality = true;
    if (source?.primary) g.primary = true;
    groups.set(key, g);
  }

  const all = [...groups.values()];
  const supports = all.filter((g) => g.supports).length;
  const contradicts = all.filter((g) => g.contradicts).length;
  const independent = groups.size;
  const quality = all.filter((g) => g.quality || g.primary).length;
  const primary = all.filter((g) => g.primary).length;
  const minorityShare = supports + contradicts ? Math.min(supports, contradicts) / (supports + contradicts) : 0;

  const factors: ConfidenceFactor[] = [
    { code: "independent_sources", value: independent },
    { code: "quality_sources", value: quality },
    { code: "primary_sources", value: primary },
  ];
  if (directSources.size > independent) factors.push({ code: "copies_merged", value: directSources.size - independent });
  if (supports && contradicts) factors.push({ code: "contested", value: Math.round(minorityShare * 100) });
  else if (independent) factors.push({ code: "one_sided" });

  let confidence: EvidenceConfidence;
  if (independent >= 4 && quality >= 2 && minorityShare <= 0.2) confidence = "high";
  else if (independent >= 2 && quality >= 1 && minorityShare <= 0.34) confidence = "medium";
  else confidence = "low";

  // Health, legal and financial claims need a stronger base before "high".
  if (claim.highImpact) {
    factors.push({ code: "high_impact" });
    if (confidence === "high" && quality < 3) confidence = "medium";
  }
  return { confidence, factors };
}
