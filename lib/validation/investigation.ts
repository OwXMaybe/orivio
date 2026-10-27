import { z } from "zod";
import { CLAIM_CATEGORIES } from "@/types/claim";
import { CONTRADICTION_FACTORS, EVIDENCE_RELATIONS } from "@/types/evidence";
import { STAGES } from "@/types/investigation";
import { SOURCE_TYPES } from "@/types/source";
import { VERDICTS } from "@/types/verdict";

/**
 * Validates an investigation sent back by the browser (e.g. for a re-check).
 * It is the user's own data but still untrusted: shapes and sizes are bounded,
 * and URLs in it are never fetched by the server.
 */
const id = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max);
const iso = z.string().max(40);
const httpUrl = z.string().max(2048).regex(/^https?:\/\//i);

const claim = z.object({
  id, text: text(1000), context: text(1000),
  kind: z.enum(["factual", "opinion", "prediction", "question"]),
  category: z.enum(CLAIM_CATEGORIES), verifiable: z.boolean(), verifiabilityReason: text(500), highImpact: z.boolean(),
});

const query = z.object({
  id, claimId: id, question: text(500), query: text(300),
  stance: z.enum(["supporting", "contradicting", "context"]), round: z.number().int().min(1).max(50),
});

const source = z.object({
  id, url: httpUrl, title: text(500), publisher: text(300), author: text(300).nullable(), publishedAt: text(60).nullable(),
  accessedAt: iso, type: z.enum(SOURCE_TYPES), primary: z.boolean().nullable(), snippet: text(2000), provider: text(60),
  queryIds: z.array(id).max(50), retrieval: z.enum(["not_attempted", "retrieved", "failed", "blocked"]),
  retrievalError: text(500).nullable(), excerpt: text(8000).nullable(), independenceGroup: id.nullable(),
  evaluationNotes: text(1000).nullable(),
});

const evidence = z.object({
  id, claimId: id, sourceId: id, quote: text(800), relation: z.enum(EVIDENCE_RELATIONS),
  explanation: text(1500), limitations: text(1000), round: z.number().int().min(1).max(50),
});

const confidenceFactor = z.object({ code: text(40), value: z.number().optional() });

const verdict = z.object({
  claimId: id, value: z.enum(VERDICTS), confidence: z.enum(["high", "medium", "low"]).nullable(),
  confidenceFactors: z.array(confidenceFactor).max(10), explanation: text(3000),
  adjustedFrom: z.enum(VERDICTS).nullable(), rule: z.enum(["insufficient_independent_evidence", "not_verifiable", "uncited"]).nullable(),
  assessedAt: iso,
});

const revision = z.object({
  revision: z.number().int().min(1).max(100), createdAt: iso,
  previousVerdicts: z.array(verdict).max(10), newVerdicts: z.array(verdict).max(10),
  newSourceIds: z.array(id).max(200), newEvidenceIds: z.array(id).max(500), changed: z.boolean(),
});

export const investigationSchema = z.object({
  id, input: text(4000), inputUrl: httpUrl.nullable(), researchLanguage: z.enum(["tr", "en"]),
  createdAt: iso, updatedAt: iso, status: z.enum(["running", "partial", "completed", "failed"]),
  mode: z.object({ ai: text(120), search: text(120).nullable() }),
  claims: z.array(claim).max(10), queries: z.array(query).max(100), sources: z.array(source).max(150),
  evidence: z.array(evidence).max(500),
  contradictions: z.array(z.object({
    claimId: id, factors: z.array(z.enum(CONTRADICTION_FACTORS)).max(8), explanation: text(3000),
    supportingEvidenceIds: z.array(id).max(200), contradictingEvidenceIds: z.array(id).max(200),
  })).max(10),
  rounds: z.number().int().min(0).max(50), verdicts: z.array(verdict).max(10), revisions: z.array(revision).max(100),
  events: z.array(z.object({ stage: z.enum(STAGES), status: z.enum(["running", "completed", "skipped", "failed"]), at: iso, detail: text(300) })).max(100),
  limitations: z.array(text(400)).max(100), primaryCategory: z.enum(CLAIM_CATEGORIES), favorite: z.boolean(),
});

export const recheckRequestSchema = z.object({ investigation: investigationSchema });
