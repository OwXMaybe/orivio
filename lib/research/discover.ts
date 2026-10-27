import type { SearchProvider, SearchResult } from "../search/types";
import type { ResearchQuery } from "@/types/claim";
import type { Language } from "@/types/investigation";
import type { Source } from "@/types/source";
import { classifySourceType, hostnameOf, normalizeUrl } from "./source-type";

export const RESULTS_PER_QUERY = 5;
export const MAX_SOURCES = 24;

export type DiscoveryOutcome = { sources: Source[]; failures: string[] };

function toSource(result: SearchResult, queryId: string, accessedAt: string): Source {
  return {
    id: crypto.randomUUID(),
    url: result.url,
    title: result.title || hostnameOf(result.url),
    publisher: result.publisher ?? hostnameOf(result.url),
    author: null,
    publishedAt: result.publishedAt,
    accessedAt,
    type: result.knownType ?? classifySourceType(result.url),
    primary: null,
    snippet: result.snippet,
    provider: result.provider,
    queryIds: [queryId],
    retrieval: "not_attempted",
    retrievalError: null,
    excerpt: null,
    independenceGroup: null,
    evaluationNotes: null,
  };
}

/** Runs every query against every provider and merges duplicate URLs. */
export async function discoverSources(
  providers: SearchProvider[],
  queries: ResearchQuery[],
  language: Language,
): Promise<DiscoveryOutcome> {
  const byUrl = new Map<string, Source>();
  const failures: string[] = [];

  const jobs = queries.flatMap((q) => providers.map((p) => ({ q, p })));
  const settled = await Promise.allSettled(
    jobs.map(({ q, p }) => p.search(q.query, { language, count: RESULTS_PER_QUERY })),
  );

  settled.forEach((outcome, i) => {
    const { q, p } = jobs[i];
    if (outcome.status === "rejected") {
      failures.push(`${p.name}: ${outcome.reason instanceof Error ? outcome.reason.message : "search failed"}`);
      return;
    }
    const accessedAt = new Date().toISOString();
    for (const result of outcome.value) {
      if (!/^https?:\/\//i.test(result.url)) continue;
      const key = normalizeUrl(result.url);
      const existing = byUrl.get(key);
      if (existing) {
        if (!existing.queryIds.includes(q.id)) existing.queryIds.push(q.id);
      } else if (byUrl.size < MAX_SOURCES) {
        byUrl.set(key, toSource(result, q.id, accessedAt));
      }
    }
  });

  return { sources: [...byUrl.values()], failures: [...new Set(failures)] };
}
