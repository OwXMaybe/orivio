import { z } from "zod";
import { UNTRUSTED_NOTICE, untrusted, type AIProvider } from "../ai/types";
import type { Claim } from "@/types/claim";
import { CONTRADICTION_FACTORS, type ContradictionAnalysis, type Evidence } from "@/types/evidence";
import type { Source } from "@/types/source";
import { independentCount } from "./independence";

const analysisSchema = z.object({
  factors: z.array(z.enum(CONTRADICTION_FACTORS)).min(1).max(4),
  explanation: z
    .string()
    .describe("3-5 sentences on why the sources reach different conclusions, citing them by their bracketed numbers, e.g. [1], [3]"),
});

const SYSTEM = `You are the contradiction-analysis stage of ORIVIO, an evidence verification lab.
Independent sources disagree about a claim. Using ONLY the passages and source details given, explain why:
different dates or data periods, different measurement methods, different definitions, a claim taken out of context,
newer research superseding older findings, different populations, or differences in source quality.
Cite sources by the bracketed numbers given, e.g. [1], [3]. Do not decide which side is right and do not add outside facts.
${UNTRUSTED_NOTICE}`;

/** Only runs when at least one independent source supports and one contradicts. */
export function hasContradiction(claimId: string, evidence: Evidence[], sources: Source[]): boolean {
  return (
    independentCount(evidence, sources, claimId, "supports") > 0 &&
    independentCount(evidence, sources, claimId, "contradicts") > 0
  );
}

export async function analyzeContradiction(
  ai: AIProvider,
  claim: Claim,
  evidence: Evidence[],
  sources: Source[],
): Promise<ContradictionAnalysis> {
  const relevant = evidence.filter((e) => e.claimId === claim.id && (e.relation === "supports" || e.relation === "contradicts"));
  const byId = new Map(sources.map((s) => [s.id, s]));
  // Labels match the reference numbers shown in the report.
  const number = new Map(sources.map((s, i) => [s.id, i + 1]));

  const material = relevant
    .map((e) => {
      const s = byId.get(e.sourceId);
      return [
        `[${number.get(e.sourceId)}] ${e.relation.toUpperCase()} — ${s?.publisher ?? "unknown"} (${s?.type ?? "other"}, published ${s?.publishedAt ?? "not stated"})`,
        s?.evaluationNotes ? `Evaluation: ${s.evaluationNotes}` : null,
        `Passage: "${e.quote}"`,
        e.limitations ? `Limitations: ${e.limitations}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const result = await ai.generateJson({
    system: SYSTEM,
    prompt: `Claim:\n${untrusted("claim", claim.text)}\n\nEvidence:\n${untrusted("evidence", material)}`,
    schema: analysisSchema,
    schemaName: "contradiction_analysis",
  });

  return {
    claimId: claim.id,
    factors: [...new Set(result.factors)],
    explanation: result.explanation.trim(),
    supportingEvidenceIds: relevant.filter((e) => e.relation === "supports").map((e) => e.id),
    contradictingEvidenceIds: relevant.filter((e) => e.relation === "contradicts").map((e) => e.id),
  };
}
