export const VERDICTS = [
  "true",
  "mostly_true",
  "misleading",
  "mostly_false",
  "false",
  "insufficient_evidence",
  "unverifiable",
] as const;

export type VerdictValue = (typeof VERDICTS)[number];

/** Verdicts that state a conclusion about the claim (counted as "verified claims"). */
export const CONCLUSIVE_VERDICTS: VerdictValue[] = ["true", "mostly_true", "misleading", "mostly_false", "false"];

/** Confidence in the evidence base — deliberately separate from the verdict itself. */
export type EvidenceConfidence = "high" | "medium" | "low";

/** The measurable facts the confidence level was computed from. */
export type ConfidenceFactor =
  | { code: "independent_sources"; value: number }
  | { code: "quality_sources"; value: number }
  | { code: "primary_sources"; value: number }
  | { code: "copies_merged"; value: number }
  | { code: "contested"; value: number } // share of independent sources on the minority side, in %
  | { code: "one_sided" }
  | { code: "high_impact" };

export type VerdictRule = "insufficient_independent_evidence" | "not_verifiable" | "uncited";

export type Verdict = {
  claimId: string;
  value: VerdictValue;
  /** Null for unverifiable claims, where there is no evidence base to rate. */
  confidence: EvidenceConfidence | null;
  confidenceFactors: ConfidenceFactor[];
  /** Cites sources by their reference numbers, e.g. [1], [3]. */
  explanation: string;
  /** Set when a rule downgraded the AI's proposed verdict (e.g. TRUE → MOSTLY TRUE). */
  adjustedFrom: VerdictValue | null;
  /** Set when the verdict came from a fixed rule instead of the AI; the UI explains it. */
  rule: VerdictRule | null;
  assessedAt: string;
};

/**
 * One entry of the correction history. Previous verdicts are kept verbatim;
 * nothing is overwritten without a revision recording it.
 */
export type ReportRevision = {
  revision: number;
  createdAt: string;
  previousVerdicts: Verdict[];
  newVerdicts: Verdict[];
  newSourceIds: string[];
  newEvidenceIds: string[];
  /** True if any claim's verdict or confidence changed. */
  changed: boolean;
};
