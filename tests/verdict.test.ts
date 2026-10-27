import { describe, expect, it } from "vitest";
import { computeConfidence } from "@/lib/research/confidence";
import { MAX_REVISIONS, recheckInvestigation, RecheckError, runInvestigation, verdictsChanged } from "@/lib/research/engine";
import { applyGuardrails, cleanCitations } from "@/lib/research/verdict";
import type { SearchProvider } from "@/lib/search/types";
import { investigationSchema } from "@/lib/validation/investigation";
import type { Claim } from "@/types/claim";
import type { Evidence } from "@/types/evidence";
import type { Source, SourceType } from "@/types/source";
import type { Verdict } from "@/types/verdict";
import { FOLK_QUOTE, PRESS_QUOTE, ZOO_QUOTE, fetcher, scriptedAI, searchFor } from "./fixtures";

const INPUT = { input: "Bats are blind.", researchLanguage: "en" as const };
const EVIDENCE_SCRIPT = {
  "Researchers at the university": [PRESS_QUOTE],
  "zoology review": [ZOO_QUOTE],
  "Old folk tales": [FOLK_QUOTE],
};
const UNI = "https://uni.example.edu/bats";
const ZOO = "https://zoo.example.org/review";
const FOLK = "https://folk.example.org/blind";

// ── Guardrails and citations ────────────────────────────────────────────────

describe("applyGuardrails", () => {
  it.each([
    ["true", 2, 0, "true"],
    ["true", 1, 0, "mostly_true"], // one source cannot make a claim TRUE
    ["true", 3, 1, "mostly_true"],
    ["mostly_true", 1, 1, "insufficient_evidence"],
    ["false", 0, 2, "false"],
    ["false", 1, 3, "mostly_false"],
    ["mostly_false", 2, 2, "insufficient_evidence"],
    ["misleading", 1, 1, "misleading"],
    ["insufficient_evidence", 5, 0, "insufficient_evidence"],
  ] as const)("%s with %i supporting / %i contradicting → %s", (value, s, c, expected) => {
    expect(applyGuardrails(value, s, c)).toBe(expected);
  });
});

describe("cleanCitations", () => {
  it("keeps valid citations and removes invented ones", () => {
    const out = cleanCitations("Studies [1] and [9] agree [2].", new Set([1, 2]));
    expect(out).toEqual({ text: "Studies [1] and agree [2].", removed: 1, valid: 2 });
  });
});

// ── Confidence ──────────────────────────────────────────────────────────────

describe("computeConfidence", () => {
  const claim = (highImpact = false): Claim => ({
    id: "k", text: "x", context: "", kind: "factual", category: "health", verifiable: true, verifiabilityReason: "", highImpact,
  });
  const src = (id: string, type: SourceType, group = id, primary = false): Source => ({
    id, url: `https://${id}.example`, title: "", publisher: "", author: null, publishedAt: null, accessedAt: "", type, primary,
    snippet: "", provider: "t", queryIds: [], retrieval: "retrieved", retrievalError: null, excerpt: "x", independenceGroup: group, evaluationNotes: null,
  });
  const ev = (sourceId: string, relation: Evidence["relation"]): Evidence => ({
    id: `${sourceId}-${relation}`, claimId: "k", sourceId, quote: "", relation, explanation: "", limitations: "", round: 1,
  });

  it("is high with many independent, good, agreeing sources", () => {
    const sources = [src("a", "academic"), src("b", "government"), src("c", "news"), src("d", "news")];
    const r = computeConfidence(claim(), sources.map((s) => ev(s.id, "supports")), sources);
    expect(r.confidence).toBe("high");
    expect(r.factors).toContainEqual({ code: "one_sided" });
  });

  it("caps high-impact claims at medium unless the base is very strong", () => {
    const sources = [src("a", "academic"), src("b", "government"), src("c", "news"), src("d", "news")];
    const r = computeConfidence(claim(true), sources.map((s) => ev(s.id, "supports")), sources);
    expect(r.confidence).toBe("medium");
    expect(r.factors).toContainEqual({ code: "high_impact" });
  });

  it("counts copies once and reports the merge", () => {
    const sources = [src("a", "academic"), src("b", "news", "a"), src("c", "news", "a")];
    const r = computeConfidence(claim(), sources.map((s) => ev(s.id, "supports")), sources);
    expect(r.confidence).toBe("low");
    expect(r.factors).toContainEqual({ code: "independent_sources", value: 1 });
    expect(r.factors).toContainEqual({ code: "copies_merged", value: 2 });
  });

  it("is low when independent sources are split", () => {
    const sources = [src("a", "academic"), src("b", "academic"), src("c", "government"), src("d", "academic")];
    const evidence = [ev("a", "supports"), ev("b", "supports"), ev("c", "contradicts"), ev("d", "contradicts")];
    const r = computeConfidence(claim(), evidence, sources);
    expect(r.confidence).toBe("low");
    expect(r.factors).toContainEqual({ code: "contested", value: 50 });
  });

  it("ignores context-only evidence", () => {
    const sources = [src("a", "academic"), src("b", "academic")];
    const r = computeConfidence(claim(), [ev("a", "provides_context"), ev("b", "provides_context")], sources);
    expect(r.factors).toContainEqual({ code: "independent_sources", value: 0 });
    expect(r.confidence).toBe("low");
  });
});

// ── Verdicts in the engine ──────────────────────────────────────────────────

describe("verdict engine", () => {
  it("accepts a well-supported verdict and completes the report", async () => {
    const ai = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "false", explanation: "Field research [1] and a review [2] show bats can see." } });
    const inv = await runInvestigation(INPUT, { ai, search: [searchFor([UNI, ZOO], [])], fetcher });
    const [v] = inv.verdicts;
    expect(v).toMatchObject({ value: "false", adjustedFrom: null, rule: null, confidence: "medium" });
    expect(v.explanation).toContain("[1]");
    expect(inv.status).toBe("completed");
    expect(inv.events.at(-1)).toMatchObject({ stage: "report_generated", detail: "complete" });
    expect(inv.limitations).not.toContain("no_verdict_yet");
  });

  it("downgrades a verdict the evidence does not support", async () => {
    const ai = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "true", explanation: "See [1]." } });
    const inv = await runInvestigation(INPUT, { ai, search: [searchFor([UNI, ZOO], [])], fetcher });
    expect(inv.verdicts[0]).toMatchObject({ value: "insufficient_evidence", adjustedFrom: "true" });
  });

  it("turns FALSE into MOSTLY FALSE when a credible source disagrees", async () => {
    const ai = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "false", explanation: "[1] and [2] contradict [3]." } });
    const inv = await runInvestigation(INPUT, { ai, search: [searchFor([UNI, ZOO, FOLK], [])], fetcher });
    expect(inv.verdicts[0]).toMatchObject({ value: "mostly_false", adjustedFrom: "false" });
    expect(inv.verdicts[0].confidenceFactors).toContainEqual({ code: "contested", value: 33 });
  });

  it("rejects an uncited verdict and strips citations to unrelated sources", async () => {
    const uncited = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "false", explanation: "Bats can see." } });
    const a = await runInvestigation(INPUT, { ai: uncited, search: [searchFor([UNI, ZOO], [])], fetcher });
    expect(a.verdicts[0]).toMatchObject({ value: "insufficient_evidence", rule: "uncited", adjustedFrom: "false" });
    expect(a.limitations).toContain("verdict_uncited");

    const invented = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "false", explanation: "[1] and [7] show it." } });
    const b = await runInvestigation(INPUT, { ai: invented, search: [searchFor([UNI, ZOO], [])], fetcher });
    expect(b.verdicts[0].explanation).toBe("[1] and show it.");
    expect(b.limitations).toContain("citations_removed:1");
  });

  it("gives INSUFFICIENT EVIDENCE by rule, without asking the AI, when evidence is thin", async () => {
    const ai = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "false", explanation: "[1]" } });
    const inv = await runInvestigation(INPUT, { ai, search: [searchFor([UNI], [])], fetcher });
    expect(inv.verdicts[0]).toMatchObject({ value: "insufficient_evidence", rule: "insufficient_independent_evidence", confidence: "low" });
    expect(ai.calls).not.toContain("verdict");
  });

  it("marks AI-classified opinions UNVERIFIABLE with no confidence rating", async () => {
    const ai = scriptedAI({
      pagesWithEvidence: EVIDENCE_SCRIPT,
      verdict: { value: "false", explanation: "[1] [2]" },
      extraClaims: [{ text: "Bats are the cutest animals.", kind: "opinion", verifiable: false }],
    });
    const inv = await runInvestigation({ input: "Bats are blind. Bats are the cutest animals.", researchLanguage: "en" }, { ai, search: [searchFor([UNI, ZOO], [])], fetcher });
    const opinion = inv.claims.find((c) => c.kind === "opinion")!;
    expect(inv.verdicts.find((v) => v.claimId === opinion.id)).toMatchObject({ value: "unverifiable", confidence: null, rule: "not_verifiable" });
  });

  it("gives no verdict at all without an AI provider", async () => {
    const inv = await runInvestigation(INPUT, { ai: null, search: [searchFor([UNI, ZOO], [])], fetcher });
    expect(inv.verdicts).toEqual([]);
    expect(inv.status).toBe("partial");
    expect(inv.limitations).toContain("no_verdict_yet");
  });

  it("records a failed assessment instead of guessing", async () => {
    const ai = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT }); // verdict step throws
    const inv = await runInvestigation(INPUT, { ai, search: [searchFor([UNI, ZOO], [])], fetcher });
    expect(inv.verdicts).toEqual([]);
    expect(inv.limitations).toEqual(expect.arrayContaining(["verdict_failed", "no_verdict_yet"]));
    expect(inv.status).toBe("partial");
  });
});

// ── Re-check and correction history ─────────────────────────────────────────

/** Search whose follow-up results can change between runs, as the web does. */
function changingSearch(round1: string[]): SearchProvider & { followUp: string[] } {
  const provider = {
    name: "mock",
    followUp: [] as string[],
    async search(query: string) {
      const urls = query.startsWith("follow-up") ? provider.followUp : round1;
      return urls.map((url) => ({ url, title: url, snippet: "", publisher: new URL(url).hostname, publishedAt: null, provider: "mock", knownType: null }));
    },
  };
  return provider;
}

describe("re-check and correction history", () => {
  it("keeps the earlier verdict in a revision and records what changed", async () => {
    const ai = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "false", explanation: "[1] and [2] show bats can see." } });
    const search = changingSearch([UNI]);
    const fetched: string[] = [];
    const trackingFetcher: typeof fetcher = (url) => {
      fetched.push(url);
      return fetcher(url);
    };

    const first = await runInvestigation(INPUT, { ai, search: [search], fetcher: trackingFetcher });
    expect(first.verdicts[0].value).toBe("insufficient_evidence");

    search.followUp = [ZOO]; // new evidence appears later
    fetched.length = 0;
    const second = await recheckInvestigation(first, { ai, search: [search], fetcher: trackingFetcher });

    expect(second.id).toBe(first.id);
    expect(second.verdicts[0].value).toBe("false");
    expect(second.revisions).toHaveLength(1);
    const [rev] = second.revisions;
    expect(rev).toMatchObject({ revision: 1, changed: true });
    expect(rev.previousVerdicts).toEqual(first.verdicts);
    expect(rev.newSourceIds).toHaveLength(1);
    expect(rev.newEvidenceIds.length).toBeGreaterThan(0);
    // Earlier evidence is kept and earlier pages are not fetched again.
    for (const e of first.evidence) expect(second.evidence.map((x) => x.id)).toContain(e.id);
    expect(fetched).toEqual([ZOO]);
    expect(second.queries.filter((q) => q.round > first.rounds).length).toBeGreaterThan(0);
  });

  it("records a re-check with no change too", async () => {
    const ai = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "false", explanation: "[1] [2]" } });
    const search = changingSearch([UNI, ZOO]);
    const first = await runInvestigation(INPUT, { ai, search: [search], fetcher });
    const second = await recheckInvestigation(first, { ai, search: [search], fetcher });
    expect(second.revisions[0]).toMatchObject({ changed: false, newSourceIds: [] });
  });

  it("requires providers and caps the number of revisions", async () => {
    const ai = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "false", explanation: "[1] [2]" } });
    const first = await runInvestigation(INPUT, { ai, search: [changingSearch([UNI, ZOO])], fetcher });
    await expect(recheckInvestigation(first, { ai: null, search: [] })).rejects.toEqual(new RecheckError("providers_required"));
    const full = { ...first, revisions: Array.from({ length: MAX_REVISIONS }, (_, i) => ({ ...first.revisions[0], revision: i + 1 })) };
    await expect(recheckInvestigation(full as typeof first, { ai, search: [changingSearch([])], fetcher })).rejects.toEqual(new RecheckError("revision_limit"));
  });

  it("detects verdict and confidence changes", () => {
    const v = (value: Verdict["value"], confidence: Verdict["confidence"]): Verdict => ({
      claimId: "k", value, confidence, confidenceFactors: [], explanation: "", adjustedFrom: null, rule: null, assessedAt: "",
    });
    expect(verdictsChanged([v("false", "low")], [v("false", "low")])).toBe(false);
    expect(verdictsChanged([v("false", "low")], [v("false", "medium")])).toBe(true);
    expect(verdictsChanged([], [v("false", "low")])).toBe(true);
  });
});

// ── Validation of client-sent investigations ────────────────────────────────

describe("investigationSchema", () => {
  it("accepts what the engine produces (after a JSON round trip)", async () => {
    const ai = scriptedAI({ pagesWithEvidence: EVIDENCE_SCRIPT, verdict: { value: "false", explanation: "[1] [2]" } });
    const inv = await runInvestigation(INPUT, { ai, search: [searchFor([UNI, ZOO], [])], fetcher });
    expect(investigationSchema.safeParse(JSON.parse(JSON.stringify(inv))).success).toBe(true);
  });

  it("rejects non-http source URLs and oversized input", async () => {
    const inv = await runInvestigation(INPUT, { ai: null, search: [searchFor([UNI], [])], fetcher });
    const bad = JSON.parse(JSON.stringify(inv));
    bad.sources[0].url = "javascript:alert(1)";
    expect(investigationSchema.safeParse(bad).success).toBe(false);
    const huge = JSON.parse(JSON.stringify(inv));
    huge.input = "x".repeat(5000);
    expect(investigationSchema.safeParse(huge).success).toBe(false);
  });
});
