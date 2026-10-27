import { describe, expect, it } from "vitest";
import type { AIProvider } from "@/lib/ai/types";
import { computeStats } from "@/lib/investigation-stats";
import { classifyClaimsHeuristic } from "@/lib/research/classify";
import { discoverSources } from "@/lib/research/discover";
import { runInvestigation } from "@/lib/research/engine";
import { extractClaimsHeuristic } from "@/lib/research/extract";
import { planResearchTemplate, planResearchWithAI } from "@/lib/research/plan";
import { classifySourceType, normalizeUrl } from "@/lib/research/source-type";
import type { SafeFetchResult } from "@/lib/security/safe-fetch";
import { UnsafeUrlError } from "@/lib/security/safe-url";
import type { SearchProvider, SearchResult } from "@/lib/search/types";
import type { Claim } from "@/types/claim";
import type { InvestigationEvent } from "@/types/investigation";

const result = (url: string, extra: Partial<SearchResult> = {}): SearchResult => ({
  url, title: `Title ${url}`, snippet: "snippet", publisher: null, publishedAt: null, provider: "mock", knownType: null, ...extra,
});

function mockSearch(results: Record<string, SearchResult[]>, name = "mock"): SearchProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    name,
    calls,
    async search(query) {
      calls.push(query);
      return results[query] ?? Object.values(results)[0] ?? [];
    },
  };
}

const page = (body: string, status = 200): SafeFetchResult => ({ finalUrl: "", status, contentType: "text/html", body, truncated: false });
const LONG_HTML = `<html><title>Page</title><body><p>${"Relevant research text. ".repeat(20)}</p></body></html>`;

describe("heuristic claim extraction", () => {
  it("splits sentences and labels kinds", () => {
    const claims = extractClaimsHeuristic("The Earth orbits the Sun. I think summer is the best season. Will it rain in 2099? Prices will rise next year.");
    expect(claims.map((c) => c.kind)).toEqual(["factual", "opinion", "question", "prediction"]);
  });

  it("handles Turkish opinion and prediction markers", () => {
    const claims = extractClaimsHeuristic("Bence bu film çok güzel. Yarın yağmur yağacak. İstanbul Türkiye'nin en kalabalık şehridir.");
    expect(claims.map((c) => c.kind)).toEqual(["opinion", "prediction", "factual"]);
  });

  it("never invents text and caps the number of claims", () => {
    const input = Array.from({ length: 9 }, (_, i) => `Statement number ${i} is here.`).join(" ");
    const claims = extractClaimsHeuristic(input);
    expect(claims).toHaveLength(5);
    for (const c of claims) expect(input).toContain(c.text);
  });

  it("does not guess a category without AI", () => {
    const [claim] = classifyClaimsHeuristic(extractClaimsHeuristic("Vaccines contain microchips."));
    expect(claim.category).toBe("other");
    expect(claim.verifiable).toBe(true);
  });
});

describe("research planning", () => {
  const claims: Claim[] = classifyClaimsHeuristic(extractClaimsHeuristic("Bats are blind. I think bats are cute."));

  it("builds a balanced template plan for verifiable claims only", () => {
    const queries = planResearchTemplate(claims, "en");
    expect(new Set(queries.map((q) => q.claimId)).size).toBe(1);
    expect(queries.map((q) => q.stance).sort()).toEqual(["context", "contradicting", "supporting"]);
  });

  it("fills in a missing side when the AI plan is one-sided", async () => {
    const ai: AIProvider = {
      name: "mock-ai",
      async generateJson<T>() {
        return { plans: [{ index: 0, queries: [{ stance: "supporting", question: "q", query: "bats blind evidence" }] }] } as T;
      },
    };
    const queries = await planResearchWithAI(ai, claims, "en");
    expect(queries.some((q) => q.stance === "contradicting")).toBe(true);
  });
});

describe("source typing and dedupe", () => {
  it.each([
    ["https://www.snopes.com/fact-check/x", "fact_checker"],
    ["https://teyit.org/analiz/x", "fact_checker"],
    ["https://www.cdc.gov/x", "government"],
    ["https://www.saglik.gov.tr/x", "government"],
    ["https://pubmed.ncbi.nlm.nih.gov/123", "academic"],
    ["https://www.mit.edu/x", "academic"],
    ["https://www.who.int/x", "research_organization"],
    ["https://www.reuters.com/world/x", "news"],
    ["https://www.reuters.com/fact-check/x", "fact_checker"],
    ["https://randomblog.example/x", "other"],
  ])("%s → %s", (url, type) => expect(classifySourceType(url)).toBe(type));

  it("normalizes tracking params and www", () => {
    expect(normalizeUrl("https://www.Example.com/a/?utm_source=x#frag")).toBe(normalizeUrl("https://example.com/a"));
  });

  it("merges duplicates across queries and records provider failures", async () => {
    const ok = mockSearch({ q1: [result("https://a.org/1"), result("https://www.a.org/1?utm_medium=x")] });
    const broken: SearchProvider = { name: "broken", search: async () => { throw new Error("down"); } };
    const queries = [
      { id: "1", claimId: "c", question: "", query: "q1", stance: "supporting" as const, round: 1 },
      { id: "2", claimId: "c", question: "", query: "q2", stance: "contradicting" as const, round: 1 },
    ];
    const { sources, failures } = await discoverSources([ok, broken], queries, "en");
    expect(sources).toHaveLength(1);
    expect(sources[0].queryIds.sort()).toEqual(["1", "2"]);
    expect(failures).toEqual(["broken: down"]);
  });
});

describe("runInvestigation", () => {
  it("without providers: completes real stages and skips the rest honestly", async () => {
    const events: InvestigationEvent[] = [];
    const inv = await runInvestigation({ input: "Lightning never strikes the same place twice.", researchLanguage: "en" }, { ai: null, search: [] }, (e) => events.push(e));
    expect(inv.status).toBe("partial");
    expect(inv.verdicts).toEqual([]);
    expect(inv.sources).toEqual([]);
    expect(inv.limitations).toEqual(expect.arrayContaining(["no_ai_provider", "no_search_provider", "no_verdict_yet"]));
    const status = Object.fromEntries(events.map((e) => [e.stage, e.status]));
    expect(status).toMatchObject({
      claim_received: "completed", claims_extracted: "completed", research_plan_created: "completed",
      sources_discovered: "skipped", evidence_analyzed: "skipped", sources_compared: "skipped",
    });
  });

  it("with search: retrieves pages, records failures and blocked URLs", async () => {
    const search = mockSearch({
      any: [
        result("https://www.snopes.com/fact-check/lightning", { knownType: null }),
        result("https://bad.example/404"),
        result("https://internal.example/redirect-to-metadata"),
      ],
    });
    const fetcher = async (url: string) => {
      if (url.includes("snopes")) return page(LONG_HTML);
      if (url.includes("404")) return page("", 404);
      throw new UnsafeUrlError("Host resolves to a private or reserved address.");
    };
    const inv = await runInvestigation({ input: "Lightning never strikes the same place twice.", researchLanguage: "en" }, { ai: null, search: [search], fetcher });
    const byUrl = Object.fromEntries(inv.sources.map((s) => [s.url, s]));
    expect(byUrl["https://www.snopes.com/fact-check/lightning"].retrieval).toBe("retrieved");
    expect(byUrl["https://www.snopes.com/fact-check/lightning"].type).toBe("fact_checker");
    expect(byUrl["https://bad.example/404"].retrieval).toBe("failed");
    expect(byUrl["https://internal.example/redirect-to-metadata"].retrieval).toBe("blocked");
    expect(search.calls.length).toBe(3);
    expect(inv.events.find((e) => e.stage === "sources_discovered")?.status).toBe("completed");
  });

  it("falls back to rules when the AI provider fails", async () => {
    const ai: AIProvider = { name: "flaky", generateJson: async () => { throw new Error("boom"); } };
    const inv = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai, search: [] });
    expect(inv.limitations).toContain("ai_failed_heuristic_used");
    expect(inv.claims[0].text).toBe("Bats are blind.");
  });

  it("stops with no plan when nothing is verifiable", async () => {
    const inv = await runInvestigation({ input: "I think pizza is the best food.", researchLanguage: "en" }, { ai: null, search: [] });
    expect(inv.queries).toEqual([]);
    expect(inv.events.find((e) => e.stage === "research_plan_created")?.status).toBe("skipped");
  });

  it("fails cleanly when a URL input cannot be fetched", async () => {
    const fetcher = async () => { throw new UnsafeUrlError("blocked"); };
    const inv = await runInvestigation({ input: "http://127.0.0.1/admin", researchLanguage: "en" }, { ai: null, search: [], fetcher });
    expect(inv.status).toBe("failed");
    expect(inv.claims).toEqual([]);
  });

  it("feeds stats from real data only", async () => {
    const inv = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai: null, search: [] });
    const stats = computeStats([inv]);
    expect(stats).toMatchObject({ total: 1, verifiedClaims: 0, sourcesRetrieved: 0, reports: 1 });
    expect(stats.perDay.at(-1)?.count).toBe(1);
  });
});
