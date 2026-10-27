export const CLAIM_CATEGORIES = [
  "science",
  "technology",
  "health",
  "politics",
  "economy",
  "history",
  "environment",
  "education",
  "other",
] as const;

export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

/** What kind of statement a fragment of the input is. Only `factual` is checkable. */
export type ClaimKind = "factual" | "opinion" | "prediction" | "question";

export type Claim = {
  id: string;
  /** The claim as stated, kept close to the user's wording. */
  text: string;
  /** Surrounding context needed to interpret the claim correctly. */
  context: string;
  kind: ClaimKind;
  category: ClaimCategory;
  verifiable: boolean;
  /** Why the claim is or is not verifiable. */
  verifiabilityReason: string;
  /** High-impact domains (health, law, finance) need extra caution in the report. */
  highImpact: boolean;
};

export type ResearchStance = "supporting" | "contradicting" | "context";

export type ResearchQuery = {
  id: string;
  claimId: string;
  question: string;
  /** The search string actually sent to the provider. */
  query: string;
  stance: ResearchStance;
  round: number;
};
