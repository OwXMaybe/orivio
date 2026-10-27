import { describe, expect, it } from "vitest";
import { runInvestigation } from "@/lib/research/engine";
import { extractEvidence, normalizeForMatch, quoteAppearsIn } from "@/lib/research/evidence";
import { assignIndependenceGroups, independentCount, textOverlap } from "@/lib/research/independence";
import type { AIProvider } from "@/lib/ai/types";
import type { Claim } from "@/types/claim";
import type { Source } from "@/types/source";
import {
  FOLK_QUOTE, PRESS_QUOTE, PRESS_RELEASE, SYNDICATED_COPY, ZOO_CONTEXT, ZOO_QUOTE, ZOOLOGY_PAGE,
  fetcher, pages, scriptedAI, searchFor,
} from "./fixtures";

// ── Unit tests ──────────────────────────────────────────────────────────────

describe("quote verification", () => {
  const text = "The study found that “roughly 40%” of adults\n  sleep less than seven hours — a long-standing trend.";

  it("tolerates whitespace, case, quote-mark and dash styles", () => {
    expect(quoteAppearsIn('the study found that "roughly 40%" of adults sleep less than seven hours - a long-standing trend', text)).toBe(true);
  });
  it("rejects paraphrases and invented numbers", () => {
    expect(quoteAppearsIn("The study found that roughly half of adults sleep too little", text)).toBe(false);
    expect(quoteAppearsIn("roughly 45% of adults sleep less than seven hours", text)).toBe(false);
  });
  it("rejects fragments too short to be meaningful", () => {
    expect(quoteAppearsIn("the study", text)).toBe(false);
  });
  it("normalizes consistently", () => {
    expect(normalizeForMatch("A  ‘b’ — c")).toBe("a 'b' - c");
  });
});

describe("independence", () => {
  const base: Omit<Source, "id" | "url" | "excerpt"> = {
    title: "", publisher: "", author: null, publishedAt: null, accessedAt: "", type: "other", primary: null, snippet: "",
    provider: "mock", queryIds: [], retrieval: "retrieved", retrievalError: null, independenceGroup: null, evaluationNotes: null,
  };
  const src = (id: string, excerpt: string | null, retrieval: Source["retrieval"] = "retrieved"): Source =>
    ({ ...base, id, url: `https://${id}.example`, excerpt, retrieval });

  it("detects a syndicated copy", () => {
    expect(textOverlap(PRESS_RELEASE, SYNDICATED_COPY)).toBeGreaterThan(0.9);
    expect(textOverlap(PRESS_RELEASE, ZOOLOGY_PAGE)).toBeLessThan(0.1);
  });

  it("groups copies, keeps distinct texts apart, and leaves unretrieved sources ungrouped", () => {
    const grouped = assignIndependenceGroups([src("a", PRESS_RELEASE), src("b", SYNDICATED_COPY), src("c", ZOOLOGY_PAGE), src("d", null, "failed")]);
    const g = Object.fromEntries(grouped.map((s) => [s.id, s.independenceGroup]));
    expect(g.a).toBe(g.b);
    expect(g.c).not.toBe(g.a);
    expect(g.d).toBeNull();
  });

  it("counts copies of one text as a single independent source", () => {
    const sources = assignIndependenceGroups([src("a", PRESS_RELEASE), src("b", SYNDICATED_COPY), src("c", ZOOLOGY_PAGE)]);
    const ev = (sourceId: string) => ({ id: sourceId, claimId: "k", sourceId, quote: "", relation: "contradicts" as const, explanation: "", limitations: "", round: 1 });
    expect(independentCount([ev("a"), ev("b")], sources, "k", "contradicts")).toBe(1);
    expect(independentCount([ev("a"), ev("b"), ev("c")], sources, "k", "contradicts")).toBe(2);
  });
});

describe("extractEvidence", () => {
  const claim: Claim = { id: "k", text: "Bats are blind.", context: "", kind: "factual", category: "science", verifiable: true, verifiabilityReason: "", highImpact: false };
  const source: Source = {
    id: "s1", url: "https://zoo.example.org/review", title: "Review", publisher: "Zoo", author: null, publishedAt: null, accessedAt: "",
    type: "academic", primary: null, snippet: "", provider: "mock", queryIds: [], retrieval: "retrieved", retrievalError: null,
    excerpt: ZOOLOGY_PAGE, independenceGroup: null, evaluationNotes: null,
  };

  it("keeps verified quotes, discards invented ones, and records the evaluation", async () => {
    const ai = scriptedAI({ pagesWithEvidence: { "zoology review": [ZOO_QUOTE] }, fakeQuote: true });
    const out = await extractEvidence(ai, claim, [source], 1);
    expect(out.evidence.map((e) => e.quote)).toEqual([ZOO_QUOTE.quote]);
    expect(out.rejectedQuotes).toBe(1);
    expect(out.evaluations.get("s1")?.notes).toBe("Assessed.");
  });
});

// ── Engine integration ──────────────────────────────────────────────────────

describe("runInvestigation with evidence intelligence", () => {
  it("runs an additional round when independent evidence is thin, then analyses the contradiction", async () => {
    // Round 1 finds only the press release and its syndicated copy: two pages, one independent source.
    const ai = scriptedAI({
      pagesWithEvidence: { "Researchers at the university": [PRESS_QUOTE], "Old folk tales": [FOLK_QUOTE], "zoology review": [ZOO_QUOTE, ZOO_CONTEXT] },
    });
    const search = searchFor(
      ["https://uni.example.edu/bats", "https://news.example.com/bats-copy"],
      ["https://folk.example.org/blind", "https://zoo.example.org/review"],
    );
    const inv = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai, search: [search], fetcher });

    expect(inv.rounds).toBe(2);
    expect(inv.queries.some((q) => q.round === 2)).toBe(true);
    expect(ai.calls).toContain("follow_up_plan");

    const relations = inv.evidence.map((e) => e.relation).sort();
    expect(relations).toEqual(["contradicts", "contradicts", "contradicts", "provides_context", "supports"]);
    // Every stored quote really occurs in its source page.
    for (const e of inv.evidence) {
      const s = inv.sources.find((x) => x.id === e.sourceId)!;
      expect(quoteAppearsIn(e.quote, pages[s.url])).toBe(true);
    }

    const press = inv.sources.find((s) => s.url.includes("uni."))!;
    const copy = inv.sources.find((s) => s.url.includes("bats-copy"))!;
    expect(copy.independenceGroup).toBe(press.independenceGroup);
    expect(press.primary).toBe(true);

    expect(inv.contradictions).toHaveLength(1);
    expect(inv.contradictions[0].factors).toEqual(["newer_research", "source_quality"]);
    const status = Object.fromEntries(inv.events.map((e) => [e.stage, `${e.status}:${e.detail}`]));
    expect(status.evidence_analyzed).toBe("completed:additional_round");
    expect(status.sources_compared).toBe("completed:contradictions_found");
    expect(inv.verdicts).toEqual([]);
    expect(inv.limitations).toContain("no_verdict_yet");
  });

  it("does not run an additional round when evidence is already sufficient", async () => {
    const ai = scriptedAI({ pagesWithEvidence: { "Researchers at the university": [PRESS_QUOTE], "zoology review": [ZOO_QUOTE] } });
    const search = searchFor(["https://uni.example.edu/bats", "https://zoo.example.org/review"], []);
    const inv = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai, search: [search], fetcher });
    expect(inv.rounds).toBe(1);
    expect(ai.calls).not.toContain("follow_up_plan");
    expect(inv.contradictions).toEqual([]);
    expect(inv.events.find((e) => e.stage === "sources_compared")?.detail).toBe("no_contradictions");
  });

  it("stops after the round limit and says the evidence is still insufficient", async () => {
    const ai = scriptedAI({ pagesWithEvidence: {} });
    const search = searchFor(["https://uni.example.edu/bats"], ["https://zoo.example.org/review"]);
    const inv = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai, search: [search], fetcher });
    expect(inv.rounds).toBe(2);
    expect(ai.calls.filter((c) => c === "follow_up_plan")).toHaveLength(1);
    expect(inv.limitations).toContain("insufficient_independent_evidence");
  });

  it("reports discarded quotes as a limitation", async () => {
    const ai = scriptedAI({ pagesWithEvidence: { "Researchers at the university": [PRESS_QUOTE], "zoology review": [ZOO_QUOTE] }, fakeQuote: true });
    const search = searchFor(["https://uni.example.edu/bats", "https://zoo.example.org/review"], []);
    const inv = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai, search: [search], fetcher });
    expect(inv.limitations).toContain("quotes_rejected:1");
    expect(inv.evidence.some((e) => e.quote.includes("2023 government report"))).toBe(false);
  });

  it("without AI: skips evidence extraction but still groups duplicate texts", async () => {
    const search = searchFor(["https://uni.example.edu/bats", "https://news.example.com/bats-copy"], []);
    const inv = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai: null, search: [search], fetcher });
    const status = Object.fromEntries(inv.events.map((e) => [e.stage, `${e.status}:${e.detail}`]));
    expect(status.evidence_analyzed).toBe("skipped:no_ai_provider");
    expect(status.sources_compared).toBe("completed:independence_only");
    expect(new Set(inv.sources.map((s) => s.independenceGroup)).size).toBe(1);
    expect(inv.limitations).toContain("no_ai_evidence");
  });

  it("records an extraction failure instead of inventing evidence", async () => {
    const base = scriptedAI({ pagesWithEvidence: {} });
    const ai: AIProvider = {
      name: "half-broken",
      generateJson: (r) => (r.schemaName === "evidence_extraction" ? Promise.reject(new Error("down")) : base.generateJson(r)),
    };
    const search = searchFor(["https://uni.example.edu/bats"], []);
    const inv = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai, search: [search], fetcher });
    expect(inv.evidence).toEqual([]);
    expect(inv.limitations).toContain("evidence_extraction_failed");
    expect(inv.events.find((e) => e.stage === "evidence_analyzed")?.status).toBe("failed");
  });
});
