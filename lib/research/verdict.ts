import { z } from "zod";
import { UNTRUSTED_NOTICE, untrusted, type AIProvider } from "../ai/types";
import type { Claim } from "@/types/claim";
import type { ContradictionAnalysis, Evidence } from "@/types/evidence";
import type { Source } from "@/types/source";
import { CONCLUSIVE_VERDICTS, type Verdict, type VerdictValue } from "@/types/verdict";
import { computeConfidence } from "./confidence";
import { independentCount } from "./independence";
import { MIN_INDEPENDENT_EVIDENCE } from "./plan";

/** The AI may not choose "unverifiable" for a claim already classified as verifiable. */
const AI_VERDICTS = ["true", "mostly_true", "misleading", "mostly_false", "false", "insufficient_evidence"] as const;

const verdictSchema = z.object({
  value: z.enum(AI_VERDICTS),
  explanation: z.string().describe("2-4 sentences. Every factual statement cites a source by its bracketed number, e.g. [1]"),
});

const SYSTEM = `You are the assessment stage of ORIVIO, an evidence verification lab.
Decide a verdict for one claim using ONLY the evidence passages given. Definitions:
- true: accurate; strong independent evidence and no credible contradiction.
- mostly_true: accurate overall but with minor inaccuracies or missing detail.
- misleading: contains accurate elements but creates a false overall impression or omits essential context.
- mostly_false: largely inaccurate, with a small element of truth.
- false: contradicted by strong independent evidence.
- insufficient_evidence: the passages do not settle the question. Prefer this over guessing.
Copies of the same text count once. Weigh source quality, primary vs secondary, dates and stated limitations.
Cite sources only by the bracketed numbers given, e.g. [1], [3]; never cite a number that is not listed and never add outside facts.
For health, legal or financial claims, state the remaining uncertainty explicitly.
${UNTRUSTED_NOTICE}`;

export type AssessmentInput = {
  evidence: Evidence[];
  sources: Source[];
  contradictions: ContradictionAnalysis[];
};

/**
 * Fixed rules applied after the AI proposes a verdict: a conclusive verdict
 * must be backed by enough independent evidence on its side.
 */
export function applyGuardrails(value: VerdictValue, supports: number, contradicts: number): VerdictValue {
  if (value === "true" && !(supports >= 2 && contradicts === 0)) value = "mostly_true";
  if (value === "mostly_true" && !(supports > contradicts)) value = "insufficient_evidence";
  if (value === "false" && !(contradicts >= 2 && supports === 0)) value = "mostly_false";
  if (value === "mostly_false" && !(contradicts > supports)) value = "insufficient_evidence";
  return value;
}

/** Removes citations to sources that hold no evidence for this claim. */
export function cleanCitations(explanation: string, allowed: Set<number>): { text: string; removed: number; valid: number } {
  let removed = 0;
  let valid = 0;
  const text = explanation
    .replace(/\[(\d+)\]/g, (match, n: string) => {
      if (allowed.has(Number(n))) {
        valid += 1;
        return match;
      }
      removed += 1;
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
  return { text, removed, valid };
}

function base(claim: Claim, input: AssessmentInput): Omit<Verdict, "value" | "explanation" | "adjustedFrom" | "rule"> {
  const { confidence, factors } = computeConfidence(claim, input.evidence, input.sources);
  return { claimId: claim.id, confidence, confidenceFactors: factors, assessedAt: new Date().toISOString() };
}

export function unverifiableVerdict(claim: Claim): Verdict {
  return {
    claimId: claim.id, value: "unverifiable", confidence: null, confidenceFactors: [], explanation: "",
    adjustedFrom: null, rule: "not_verifiable", assessedAt: new Date().toISOString(),
  };
}

export type AssessmentOutcome = { verdict: Verdict; removedCitations: number };

export async function assessClaim(ai: AIProvider, claim: Claim, input: AssessmentInput): Promise<AssessmentOutcome> {
  const supports = independentCount(input.evidence, input.sources, claim.id, "supports");
  const contradicts = independentCount(input.evidence, input.sources, claim.id, "contradicts");

  // Too little independent evidence: no AI judgement is requested at all.
  if (supports + contradicts < MIN_INDEPENDENT_EVIDENCE) {
    return {
      verdict: { ...base(claim, input), value: "insufficient_evidence", explanation: "", adjustedFrom: null, rule: "insufficient_independent_evidence" },
      removedCitations: 0,
    };
  }

  const number = new Map(input.sources.map((s, i) => [s.id, i + 1]));
  const byId = new Map(input.sources.map((s) => [s.id, s]));
  const claimEvidence = input.evidence.filter((e) => e.claimId === claim.id);
  const allowed = new Set(claimEvidence.map((e) => number.get(e.sourceId)!).filter(Boolean));

  const material = claimEvidence
    .map((e) => {
      const s = byId.get(e.sourceId);
      const copyOf = s?.independenceGroup && s.independenceGroup !== s.id ? ` (same text as [${number.get(s.independenceGroup)}])` : "";
      return [
        `[${number.get(e.sourceId)}] ${e.relation.toUpperCase()} — ${s?.publisher ?? "unknown"}, ${s?.type ?? "other"}, ${s?.primary === true ? "primary" : s?.primary === false ? "secondary" : "unevaluated"}, published ${s?.publishedAt ?? "not stated"}${copyOf}`,
        s?.evaluationNotes ? `Evaluation: ${s.evaluationNotes}` : null,
        `Passage: "${e.quote}"`,
        e.limitations ? `Limitations: ${e.limitations}` : null,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
  const conflict = input.contradictions.find((c) => c.claimId === claim.id);

  const result = await ai.generateJson({
    system: SYSTEM,
    prompt: [
      `Claim:\n${untrusted("claim", claim.context ? `${claim.text}\n(context: ${claim.context})` : claim.text)}`,
      claim.highImpact ? "This is a high-impact (health, legal or financial) claim." : null,
      `Independent sources: ${supports} supporting, ${contradicts} contradicting.`,
      `Evidence:\n${untrusted("evidence", material)}`,
      conflict ? `Analysis of the disagreement:\n${untrusted("analysis", conflict.explanation)}` : null,
    ].filter(Boolean).join("\n\n"),
    schema: verdictSchema,
    schemaName: "verdict",
  });

  const citations = cleanCitations(result.explanation, allowed);
  let value = applyGuardrails(result.value, supports, contradicts);
  let rule: Verdict["rule"] = null;
  if (CONCLUSIVE_VERDICTS.includes(value) && citations.valid === 0) {
    value = "insufficient_evidence";
    rule = "uncited";
  }
  return {
    verdict: {
      ...base(claim, input),
      value,
      explanation: citations.text,
      adjustedFrom: value !== result.value ? result.value : null,
      rule,
    },
    removedCitations: citations.removed,
  };
}
