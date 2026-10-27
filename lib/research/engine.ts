import type { AIProvider } from "../ai/types";
import { extractPage } from "../security/html";
import { safeFetch } from "../security/safe-fetch";
import { detectUrlInput } from "../security/safe-url";
import type { SearchProvider } from "../search/types";
import type { Claim, ClaimCategory, ResearchQuery } from "@/types/claim";
import type { Investigation, InvestigationEvent, Language, StageId, StageStatus } from "@/types/investigation";
import type { Source } from "@/types/source";
import type { ReportRevision, Verdict } from "@/types/verdict";
import { classifyClaimsHeuristic, classifyClaimsWithAI } from "./classify";
import { analyzeContradiction, hasContradiction } from "./contradiction";
import { discoverSources } from "./discover";
import { extractEvidence, MAX_SOURCES_PER_CALL, sourcesForClaim } from "./evidence";
import { extractClaimsHeuristic, extractClaimsWithAI, type ExtractedClaim } from "./extract";
import { assignIndependenceGroups, independentCount } from "./independence";
import {
  MAX_ROUNDS,
  MIN_INDEPENDENT_EVIDENCE,
  planFollowUpWithAI,
  planResearchTemplate,
  planResearchWithAI,
  researchableClaims,
  type EvidenceTally,
} from "./plan";
import { retrieveSources, type Fetcher } from "./retrieve";
import { normalizeUrl } from "./source-type";
import { assessClaim, unverifiableVerdict } from "./verdict";

export type EngineDeps = {
  ai: AIProvider | null;
  search: SearchProvider[];
  fetcher?: Fetcher;
};

export type EngineInput = { input: string; researchLanguage: Language };

const MAX_ARTICLE_CHARS = 4000;
/** Re-checks are capped so one report cannot trigger unbounded research. */
export const MAX_REVISIONS = 10;

type Recorder = (stage: StageId, status: StageStatus, detail?: string) => void;

/** Shared state for one engine run (initial investigation or re-check). */
type RunContext = {
  inv: Investigation;
  ai: AIProvider | null;
  /** True when claims were classified by the AI, so "not verifiable" is a real judgement. */
  aiClassified: boolean;
  search: SearchProvider[];
  fetcher: Fetcher;
  record: Recorder;
  /** `${claimId}|${sourceId}` pairs already sent to evidence extraction. */
  analyzed: Set<string>;
};

function makeRecorder(inv: Investigation, emit: (event: InvestigationEvent) => void): Recorder {
  return (stage, status, detail = "") => {
    const event = { stage, status, detail, at: new Date().toISOString() };
    inv.events.push(event);
    emit(event);
  };
}

/**
 * Orchestrates the investigation. Each stage emits an event only once its
 * work has actually finished; stages that cannot run are reported as skipped.
 */
export async function runInvestigation(
  { input, researchLanguage }: EngineInput,
  deps: EngineDeps,
  emit: (event: InvestigationEvent) => void = () => {},
): Promise<Investigation> {
  const now = new Date().toISOString();
  const inv: Investigation = {
    id: crypto.randomUUID(),
    input,
    inputUrl: null,
    researchLanguage,
    createdAt: now,
    updatedAt: now,
    status: "running",
    mode: { ai: deps.ai?.name ?? "heuristic", search: deps.search.map((s) => s.name).join(", ") || null },
    claims: [],
    queries: [],
    sources: [],
    evidence: [],
    contradictions: [],
    rounds: 0,
    verdicts: [],
    revisions: [],
    events: [],
    limitations: [],
    primaryCategory: "other",
    favorite: false,
  };
  const record = makeRecorder(inv, emit);
  const fetcher = deps.fetcher ?? safeFetch;
  const { limitations } = inv;

  // Stage 0 — receive input, resolving an article URL to its text.
  let text = input;
  const url = detectUrlInput(input);
  if (url) {
    inv.inputUrl = url;
    try {
      const page = await fetcher(url);
      const extracted = extractPage(page.body, MAX_ARTICLE_CHARS);
      if (page.status >= 300 || extracted.text.length < 80) throw new Error(`HTTP ${page.status}`);
      text = [extracted.title, extracted.text].filter(Boolean).join("\n");
      limitations.push("url_input_truncated");
      record("claim_received", "completed", "url_fetched");
    } catch (error) {
      limitations.push("url_input_failed");
      record("claim_received", "failed", error instanceof Error ? error.message : "url_fetch_failed");
      inv.status = "failed";
      return inv;
    }
  } else {
    record("claim_received", "completed", "text");
  }

  // Stages 1–2 — claim extraction and classification.
  let extracted: ExtractedClaim[];
  let aiClassified = false;
  if (deps.ai) {
    try {
      extracted = await extractClaimsWithAI(deps.ai, text);
      inv.claims = await classifyClaimsWithAI(deps.ai, extracted);
      aiClassified = true;
    } catch {
      limitations.push("ai_failed_heuristic_used");
      inv.claims = classifyClaimsHeuristic(extractClaimsHeuristic(text));
    }
  } else {
    limitations.push("no_ai_provider");
    inv.claims = classifyClaimsHeuristic(extractClaimsHeuristic(text));
  }
  inv.primaryCategory = mostCommonCategory(inv.claims);
  record("claims_extracted", "completed", String(inv.claims.length));

  // Once the AI provider has failed, later stages do not keep calling it.
  const ai = aiClassified ? deps.ai : null;
  const ctx: RunContext = { inv, ai, aiClassified, search: deps.search, fetcher, record, analyzed: new Set() };

  // Stage 3 — balanced research plan.
  if (!inv.claims.some((c) => c.verifiable)) {
    limitations.push("no_verifiable_claims");
    record("research_plan_created", "skipped", "no_verifiable_claims");
    return finish(ctx, "no_verifiable_claims");
  }
  let queries: ResearchQuery[];
  if (ai) {
    try {
      queries = await planResearchWithAI(ai, inv.claims, researchLanguage);
    } catch {
      limitations.push("ai_plan_failed_template_used");
      queries = planResearchTemplate(inv.claims, researchLanguage);
    }
  } else {
    queries = planResearchTemplate(inv.claims, researchLanguage);
  }
  inv.queries = queries;
  record("research_plan_created", "completed", String(queries.length));

  // Stage 4 — web research and source retrieval.
  if (!deps.search.length) {
    limitations.push("no_search_provider");
    record("sources_discovered", "skipped", "no_search_provider");
    return finish(ctx, "no_search_provider");
  }
  const discovery = await discoverSources(deps.search, queries, researchLanguage);
  for (const failure of discovery.failures) limitations.push(`search_failure:${failure}`);
  inv.sources = await retrieveSources(discovery.sources, fetcher);
  inv.rounds = 1;
  if (!inv.sources.length) {
    limitations.push("no_sources_found");
    record("sources_discovered", "failed", "0");
    return finish(ctx, "no_sources");
  }
  record("sources_discovered", "completed", String(inv.sources.length));

  if (!ai) {
    limitations.push("no_ai_evidence");
    record("evidence_analyzed", "skipped", "no_ai_provider");
    // Independence can still be measured from the retrieved text alone.
    inv.sources = assignIndependenceGroups(inv.sources);
    const compared = inv.sources.some((s) => s.independenceGroup);
    record("sources_compared", compared ? "completed" : "skipped", compared ? "independence_only" : "no_retrieved_sources");
    return finish(ctx);
  }

  await analyzeCompareAssess(ctx, ai, 1);
  return finish(ctx);
}

/**
 * Re-runs research for an existing investigation with new queries, keeps
 * everything found before, re-assesses every claim and records a revision.
 * Previous verdicts are preserved in the revision, never silently replaced.
 */
export async function recheckInvestigation(
  previous: Investigation,
  deps: EngineDeps,
  emit: (event: InvestigationEvent) => void = () => {},
): Promise<Investigation> {
  if (!deps.ai || !deps.search.length) throw new RecheckError("providers_required");
  if (previous.revisions.length >= MAX_REVISIONS) throw new RecheckError("revision_limit");
  const ai = deps.ai;

  const inv: Investigation = structuredClone(previous);
  inv.events = [];
  // Limitations describe the latest run; keep only those about the original input.
  inv.limitations = previous.limitations.filter((l) => l.startsWith("url_input"));
  inv.mode = { ai: ai.name, search: deps.search.map((s) => s.name).join(", ") };
  inv.status = "running";
  const record = makeRecorder(inv, emit);
  const fetcher = deps.fetcher ?? safeFetch;
  // Everything retrieved earlier has already been through extraction.
  const analyzed = new Set(inv.claims.flatMap((c) => inv.sources.map((s) => `${c.id}|${s.id}`)));
  const ctx: RunContext = { inv, ai, aiClassified: previous.mode.ai !== "heuristic", search: deps.search, fetcher, record, analyzed };

  record("claim_received", "completed", "recheck");
  record("claims_extracted", "completed", "reused");

  const researched = researchableClaims(inv.claims);
  if (!researched.length) {
    record("research_plan_created", "skipped", "no_verifiable_claims");
    return finishRecheck(previous, finish(ctx, "no_verifiable_claims"));
  }

  const round = Math.max(previous.rounds, 1) + 1;
  const fresh = (
    await Promise.all(
      researched.map((claim) =>
        planFollowUpWithAI(ai, claim, inv.queries.filter((q) => q.claimId === claim.id), tally(inv, claim), inv.researchLanguage, round).catch(() => []),
      ),
    )
  ).flat();
  if (!fresh.length) {
    inv.limitations.push("recheck_plan_failed");
    record("research_plan_created", "failed", "recheck");
    return finishRecheck(previous, finish(ctx, "not_reached"));
  }
  inv.queries.push(...fresh);
  inv.rounds = round;
  record("research_plan_created", "completed", String(fresh.length));

  const before = inv.sources.length;
  const discovery = await discoverSources(deps.search, fresh, inv.researchLanguage);
  for (const failure of discovery.failures) inv.limitations.push(`search_failure:${failure}`);
  inv.sources = await mergeNewSources(inv.sources, discovery.sources, fetcher);
  record("sources_discovered", "completed", String(inv.sources.length - before));

  await analyzeCompareAssess(ctx, ai, round);
  return finishRecheck(previous, finish(ctx));
}

export class RecheckError extends Error {
  constructor(readonly code: "providers_required" | "revision_limit") {
    super(code);
    this.name = "RecheckError";
  }
}

function tally(inv: Investigation, claim: Claim): EvidenceTally {
  return {
    supports: independentCount(inv.evidence, inv.sources, claim.id, "supports"),
    contradicts: independentCount(inv.evidence, inv.sources, claim.id, "contradicts"),
    context: independentCount(inv.evidence, inv.sources, claim.id, "provides_context"),
  };
}

/** Stages 5–9: evidence extraction, additional research, contradiction analysis, verdicts. */
async function analyzeCompareAssess(ctx: RunContext, ai: AIProvider, firstRound: number): Promise<void> {
  const { inv, record } = ctx;
  const researched = researchableClaims(inv.claims);
  let rejectedQuotes = 0;
  let extractionFailures = 0;

  const analyzeClaims = async (targets: Claim[], round: number) => {
    await Promise.all(
      targets.map(async (claim) => {
        const queryIds = new Set(inv.queries.filter((q) => q.claimId === claim.id).map((q) => q.id));
        const fresh = sourcesForClaim(claim, inv.sources, queryIds)
          .filter((s) => !ctx.analyzed.has(`${claim.id}|${s.id}`))
          .slice(0, MAX_SOURCES_PER_CALL);
        if (!fresh.length) return;
        try {
          const outcome = await extractEvidence(ai, claim, fresh, round);
          fresh.forEach((s) => ctx.analyzed.add(`${claim.id}|${s.id}`));
          inv.evidence.push(...outcome.evidence);
          rejectedQuotes += outcome.rejectedQuotes;
          inv.sources = inv.sources.map((s) => {
            const evaluation = outcome.evaluations.get(s.id);
            return evaluation && s.evaluationNotes === null ? { ...s, primary: evaluation.isPrimary, evaluationNotes: evaluation.notes } : s;
          });
        } catch {
          extractionFailures += 1;
        }
      }),
    );
    inv.sources = assignIndependenceGroups(inv.sources);
  };
  const needsMore = (claim: Claim) => {
    const t = tally(inv, claim);
    return t.supports + t.contradicts < MIN_INDEPENDENT_EVIDENCE;
  };

  await analyzeClaims(researched, firstRound);

  // Bounded additional rounds: only for claims that still lack independent evidence.
  for (let round = firstRound + 1; round < firstRound + MAX_ROUNDS; round++) {
    const gaps = researched.filter(needsMore);
    if (!gaps.length) break;
    const followUps = (
      await Promise.all(
        gaps.map((claim) =>
          planFollowUpWithAI(ai, claim, inv.queries.filter((q) => q.claimId === claim.id), tally(inv, claim), inv.researchLanguage, round).catch(() => []),
        ),
      )
    ).flat();
    if (!followUps.length) break;
    inv.queries.push(...followUps);
    inv.rounds = round;

    const more = await discoverSources(ctx.search, followUps, inv.researchLanguage);
    for (const failure of more.failures) inv.limitations.push(`search_failure:${failure}`);
    inv.sources = await mergeNewSources(inv.sources, more.sources, ctx.fetcher);
    await analyzeClaims(gaps, round);
  }

  if (rejectedQuotes) inv.limitations.push(`quotes_rejected:${rejectedQuotes}`);
  if (extractionFailures) inv.limitations.push("evidence_extraction_failed");
  if (researched.some(needsMore)) inv.limitations.push("insufficient_independent_evidence");
  record(
    "evidence_analyzed",
    extractionFailures && !inv.evidence.length ? "failed" : "completed",
    inv.rounds > firstRound ? "additional_round" : String(inv.evidence.length),
  );

  // Contradiction analysis, only where independent sources disagree. Recomputed on every run.
  inv.contradictions = [];
  for (const claim of researched) {
    if (!hasContradiction(claim.id, inv.evidence, inv.sources)) continue;
    try {
      inv.contradictions.push(await analyzeContradiction(ai, claim, inv.evidence, inv.sources));
    } catch {
      inv.limitations.push("contradiction_analysis_failed");
    }
  }
  record("sources_compared", "completed", inv.contradictions.length ? "contradictions_found" : "no_contradictions");

  // Verdicts and evidence confidence.
  const verdicts: Verdict[] = [];
  let removedCitations = 0;
  for (const claim of researched) {
    try {
      const outcome = await assessClaim(ai, claim, inv);
      verdicts.push(outcome.verdict);
      removedCitations += outcome.removedCitations;
      if (outcome.verdict.rule === "uncited") inv.limitations.push("verdict_uncited");
    } catch {
      inv.limitations.push("verdict_failed");
    }
  }
  if (removedCitations) inv.limitations.push(`citations_removed:${removedCitations}`);
  inv.verdicts = verdicts;
}

/**
 * Adds newly discovered sources, retrieving only those not seen before;
 * a repeat URL just gains the new query ids.
 */
async function mergeNewSources(existing: Source[], found: Source[], fetcher: Fetcher): Promise<Source[]> {
  const byUrl = new Map(existing.map((s) => [normalizeUrl(s.url), s]));
  const fresh: Source[] = [];
  for (const source of found) {
    const known = byUrl.get(normalizeUrl(source.url));
    if (known) {
      known.queryIds = [...new Set([...known.queryIds, ...source.queryIds])];
    } else {
      fresh.push(source);
    }
  }
  return [...existing, ...(await retrieveSources(fresh, fetcher))];
}

/** Records stages that could not run, adds rule-based verdicts, and closes the report. */
function finish(ctx: RunContext, reason = "not_reached"): Investigation {
  const { inv, record } = ctx;
  for (const stage of ["evidence_analyzed", "sources_compared"] as const) {
    if (!inv.events.some((e) => e.stage === stage)) record(stage, "skipped", reason);
  }
  // Statements the AI classified as not verifiable get an UNVERIFIABLE verdict without further research.
  if (ctx.aiClassified) {
    for (const claim of inv.claims) {
      if (!claim.verifiable && !inv.verdicts.some((v) => v.claimId === claim.id)) inv.verdicts.push(unverifiableVerdict(claim));
    }
  }
  const researched = researchableClaims(inv.claims);
  const allAssessed = inv.claims.length > 0 && researched.every((c) => inv.verdicts.some((v) => v.claimId === c.id && v.value !== "unverifiable"));
  const someVerifiableAssessed = researched.some((c) => inv.verdicts.some((v) => v.claimId === c.id));
  if (!someVerifiableAssessed && researched.length) inv.limitations.push("no_verdict_yet");
  if (inv.claims.filter((c) => c.verifiable).length > researched.length) inv.limitations.push("claims_not_researched");
  inv.status = allAssessed && (researched.length > 0 || inv.verdicts.length > 0) ? "completed" : "partial";
  record("report_generated", "completed", inv.status === "completed" ? "complete" : "partial");
  inv.updatedAt = new Date().toISOString();
  return inv;
}

function finishRecheck(previous: Investigation, inv: Investigation): Investigation {
  const previousSources = new Set(previous.sources.map((s) => s.id));
  const previousEvidence = new Set(previous.evidence.map((e) => e.id));
  const revision: ReportRevision = {
    revision: previous.revisions.length + 1,
    createdAt: inv.updatedAt,
    previousVerdicts: previous.verdicts,
    newVerdicts: inv.verdicts,
    newSourceIds: inv.sources.filter((s) => !previousSources.has(s.id)).map((s) => s.id),
    newEvidenceIds: inv.evidence.filter((e) => !previousEvidence.has(e.id)).map((e) => e.id),
    changed: verdictsChanged(previous.verdicts, inv.verdicts),
  };
  inv.revisions = [...previous.revisions, revision];
  return inv;
}

export function verdictsChanged(before: Verdict[], after: Verdict[]): boolean {
  const key = (vs: Verdict[]) =>
    vs.map((v) => `${v.claimId}:${v.value}:${v.confidence}`).sort().join("|");
  return key(before) !== key(after);
}

function mostCommonCategory(claims: Claim[]): ClaimCategory {
  const counts = new Map<ClaimCategory, number>();
  for (const c of claims) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  let best: ClaimCategory = "other";
  let max = 0;
  for (const [category, count] of counts) {
    if (count > max || (count === max && best === "other")) {
      best = category;
      max = count;
    }
  }
  return best;
}
