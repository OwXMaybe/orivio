export const SOURCE_TYPES = [
  "academic",
  "government",
  "news",
  "research_organization",
  "fact_checker",
  "other",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

/** Whether the page itself was retrieved, as opposed to only seen in search results. */
export type RetrievalStatus = "not_attempted" | "retrieved" | "failed" | "blocked";

export type Source = {
  id: string;
  url: string;
  title: string;
  publisher: string;
  author: string | null;
  /** Publication date as reported by the provider/page. Never inferred. */
  publishedAt: string | null;
  /** When ORIVIO accessed the page (or the search result). */
  accessedAt: string;
  type: SourceType;
  /** Primary vs secondary cannot be known from a URL alone; null until evaluated. */
  primary: boolean | null;
  /** Search result description — not evidence on its own. */
  snippet: string;
  provider: string;
  queryIds: string[];
  retrieval: RetrievalStatus;
  retrievalError: string | null;
  /** Plain-text excerpt of the retrieved page, truncated. Untrusted content. */
  excerpt: string | null;
  /**
   * Sources whose text is largely the same (e.g. one press release republished)
   * share a group and count as one independent piece of evidence.
   */
  independenceGroup: string | null;
  /** Evaluation of expertise, methodology and date relevance. Null until evaluated. */
  evaluationNotes: string | null;
};
