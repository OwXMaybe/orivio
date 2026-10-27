export const EVIDENCE_RELATIONS = [
  "supports",
  "contradicts",
  "provides_context",
  "challenges_methodology",
] as const;

export type EvidenceRelation = (typeof EVIDENCE_RELATIONS)[number];

export type Evidence = {
  id: string;
  claimId: string;
  sourceId: string;
  /**
   * Passage copied from the retrieved source. Verified to occur in the source
   * text (ignoring whitespace and quote-mark style) before it is stored.
   */
  quote: string;
  relation: EvidenceRelation;
  explanation: string;
  limitations: string;
  /** Research round in which the source was found (1 = initial plan). */
  round: number;
};

export const CONTRADICTION_FACTORS = [
  "different_dates",
  "different_methods",
  "different_definitions",
  "out_of_context",
  "newer_research",
  "different_populations",
  "source_quality",
  "other",
] as const;

export type ContradictionFactor = (typeof CONTRADICTION_FACTORS)[number];

/** Why independent sources disagree about a claim. Only produced when they do. */
export type ContradictionAnalysis = {
  claimId: string;
  factors: ContradictionFactor[];
  explanation: string;
  /** Evidence ids on each side, so every statement stays traceable. */
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
};
