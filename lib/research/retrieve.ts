import { extractPage } from "../security/html";
import { safeFetch } from "../security/safe-fetch";
import { UnsafeUrlError } from "../security/safe-url";
import type { Source } from "@/types/source";

export const MAX_RETRIEVALS = 8;
const CONCURRENCY = 4;
const EXCERPT_CHARS = 6000;

export type Fetcher = typeof safeFetch;

/** Order sources so that each query and each source type gets represented first. */
function prioritize(sources: Source[]): Source[] {
  const rank: Record<Source["type"], number> = {
    fact_checker: 0, academic: 1, government: 1, research_organization: 2, news: 3, other: 4,
  };
  return [...sources].sort((a, b) => rank[a.type] - rank[b.type]);
}

async function retrieveOne(source: Source, fetcher: Fetcher): Promise<Source> {
  try {
    const page = await fetcher(source.url);
    if (page.status < 200 || page.status >= 300) {
      return { ...source, retrieval: "failed", retrievalError: `HTTP ${page.status}` };
    }
    if (!/text\/html|application\/xhtml|text\/plain/i.test(page.contentType)) {
      return { ...source, retrieval: "failed", retrievalError: `Unsupported content type (${page.contentType || "unknown"})` };
    }
    const extracted = page.contentType.includes("text/plain")
      ? { title: null, siteName: null, author: null, publishedAt: null, text: page.body.slice(0, EXCERPT_CHARS) }
      : extractPage(page.body, EXCERPT_CHARS);
    if (extracted.text.length < 200) {
      return { ...source, retrieval: "failed", retrievalError: "Page had too little readable text (may require JavaScript or a login)." };
    }
    return {
      ...source,
      retrieval: "retrieved",
      accessedAt: new Date().toISOString(),
      // Search-provider metadata wins; page metadata only fills gaps.
      author: source.author ?? extracted.author,
      publishedAt: source.publishedAt ?? extracted.publishedAt,
      publisher: source.publisher || extracted.siteName || source.publisher,
      excerpt: extracted.text,
    };
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return { ...source, retrieval: "blocked", retrievalError: error.message };
    }
    return { ...source, retrieval: "failed", retrievalError: error instanceof Error ? error.message : "Retrieval failed." };
  }
}

/** Fetches the highest-priority sources. Sources beyond the limit stay "not_attempted". */
export async function retrieveSources(sources: Source[], fetcher: Fetcher = safeFetch): Promise<Source[]> {
  const targets = prioritize(sources).slice(0, MAX_RETRIEVALS).map((s) => s.id);
  const results = new Map<string, Source>();
  const queue = sources.filter((s) => targets.includes(s.id));
  async function worker() {
    for (let next = queue.shift(); next; next = queue.shift()) {
      results.set(next.id, await retrieveOne(next, fetcher));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return sources.map((s) => results.get(s.id) ?? s);
}
