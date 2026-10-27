import type { Language } from "@/types/investigation";
import type { SourceType } from "@/types/source";

export type SearchResult = {
  url: string;
  title: string;
  snippet: string;
  publisher: string | null;
  publishedAt: string | null;
  provider: string;
  /** Set when the provider itself knows the kind of source (e.g. fact-check APIs). */
  knownType: SourceType | null;
};

export type SearchOptions = { language: Language; count: number };

export interface SearchProvider {
  readonly name: string;
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}

export class SearchProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchProviderError";
  }
}
