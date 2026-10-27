import type { Claim, ClaimCategory, ResearchQuery } from "./claim";
import type { ContradictionAnalysis, Evidence } from "./evidence";
import type { Source } from "./source";
import type { ReportRevision, Verdict } from "./verdict";

export type Language = "tr" | "en";

export const STAGES = [
  "claim_received",
  "claims_extracted",
  "research_plan_created",
  "sources_discovered",
  "evidence_analyzed",
  "sources_compared",
  "report_generated",
] as const;

export type StageId = (typeof STAGES)[number];

/**
 * `skipped` means the stage could not run (e.g. no provider configured) —
 * it is never shown as completed.
 */
export type StageStatus = "running" | "completed" | "skipped" | "failed";

export type InvestigationEvent = {
  stage: StageId;
  status: StageStatus;
  at: string;
  /** Machine-readable detail; the UI localizes it. */
  detail: string;
};

export type EngineMode = {
  /** Which AI provider handled extraction/classification, or "heuristic". */
  ai: string;
  /** Which search provider ran, or null when none is configured. */
  search: string | null;
};

export type InvestigationStatus = "running" | "partial" | "completed" | "failed";

export type Investigation = {
  id: string;
  input: string;
  inputUrl: string | null;
  /** Language of the research queries — independent of the interface language. */
  researchLanguage: Language;
  createdAt: string;
  status: InvestigationStatus;
  mode: EngineMode;
  claims: Claim[];
  queries: ResearchQuery[];
  sources: Source[];
  evidence: Evidence[];
  contradictions: ContradictionAnalysis[];
  /** Number of research rounds actually run (additional rounds are capped). */
  rounds: number;
  verdicts: Verdict[];
  /** Correction history: one entry per re-check after the initial assessment. */
  revisions: ReportRevision[];
  /** Last time research was run (initial run or re-check). */
  updatedAt: string;
  events: InvestigationEvent[];
  /** Explicit list of what this run could not do, shown in the report. */
  limitations: string[];
  primaryCategory: ClaimCategory;
  favorite: boolean;
  /** Owner-only: set when the report is shared by link. Never present in a shared copy. */
  shareToken?: string | null;
};

/** Messages streamed (as NDJSON) from /api/investigate. */
export type EngineMessage =
  | { type: "event"; event: InvestigationEvent }
  | { type: "result"; investigation: Investigation }
  | { type: "error"; error: string };
