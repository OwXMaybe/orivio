import { z } from "zod";
import { SearchProviderError, type SearchOptions, type SearchProvider, type SearchResult } from "./types";

const responseSchema = z.object({
  web: z
    .object({
      results: z.array(
        z.object({
          url: z.string(),
          title: z.string().default(""),
          description: z.string().default(""),
          page_age: z.string().optional(),
          profile: z.object({ name: z.string().optional() }).optional(),
          meta_url: z.object({ hostname: z.string().optional() }).optional(),
        }),
      ),
    })
    .optional(),
});

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";

  constructor(private apiKey: string, private baseUrl: string) {}

  async search(query: string, { language, count }: SearchOptions): Promise<SearchResult[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(count, 20)));
    url.searchParams.set("search_lang", language);
    url.searchParams.set("safesearch", "moderate");

    const response = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": this.apiKey },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw new SearchProviderError("Search provider could not be reached.");
    });
    if (!response.ok) throw new SearchProviderError(`Search provider error (${response.status}).`);

    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new SearchProviderError("Search provider returned an unexpected response.");

    return (parsed.data.web?.results ?? []).map((r) => ({
      url: r.url,
      title: stripTags(r.title),
      snippet: stripTags(r.description),
      publisher: r.profile?.name ?? r.meta_url?.hostname ?? null,
      // page_age is the provider's estimate of publication time; it is kept as reported.
      publishedAt: r.page_age ?? null,
      provider: this.name,
      knownType: null,
    }));
  }
}
