import { z } from "zod";
import { SearchProviderError, type SearchOptions, type SearchProvider, type SearchResult } from "../search/types";

const ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";

const responseSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().default(""),
        claimant: z.string().optional(),
        claimReview: z
          .array(
            z.object({
              url: z.string(),
              title: z.string().optional(),
              reviewDate: z.string().optional(),
              textualRating: z.string().optional(),
              publisher: z.object({ name: z.string().optional(), site: z.string().optional() }).optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

/** Google Fact Check Tools: returns published fact-checks, not raw web results. */
export class GoogleFactCheckProvider implements SearchProvider {
  readonly name = "google_fact_check";

  constructor(private apiKey: string) {}

  async search(query: string, { language, count }: SearchOptions): Promise<SearchResult[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set("query", query.slice(0, 500));
    url.searchParams.set("languageCode", language);
    url.searchParams.set("pageSize", String(Math.min(count, 10)));
    url.searchParams.set("key", this.apiKey);

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) }).catch(() => {
      throw new SearchProviderError("Fact-check provider could not be reached.");
    });
    if (!response.ok) throw new SearchProviderError(`Fact-check provider error (${response.status}).`);

    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new SearchProviderError("Fact-check provider returned an unexpected response.");

    return parsed.data.claims.flatMap((claim) =>
      claim.claimReview.map((review) => ({
        url: review.url,
        title: review.title ?? claim.text,
        // Quote the reviewed claim and the publisher's own rating label verbatim.
        snippet: [
          `Reviewed claim: "${claim.text}"`,
          claim.claimant ? `Claimant: ${claim.claimant}` : null,
          review.textualRating ? `Publisher rating: ${review.textualRating}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        publisher: review.publisher?.name ?? review.publisher?.site ?? null,
        publishedAt: review.reviewDate ?? null,
        provider: this.name,
        knownType: "fact_checker" as const,
      })),
    );
  }
}
