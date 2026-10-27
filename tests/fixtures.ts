import type { AIProvider, JsonRequest } from "@/lib/ai/types";
import type { SafeFetchResult } from "@/lib/security/safe-fetch";
import type { SearchProvider, SearchResult } from "@/lib/search/types";

/** Shared fixtures: four pages about bats, a mock fetcher and search, and a scripted AI. */

export const PRESS_RELEASE =
  "Researchers at the university reported today that bats are not blind. All bat species have functional eyes and many see well in low light. " +
  "The team examined forty species over five years and found that vision complements echolocation during long-distance navigation. " +
  "Fruit bats in particular rely heavily on sight and some can perceive ultraviolet light, the study said.";
export const SYNDICATED_COPY = `News desk. ${PRESS_RELEASE} Copyright the news agency, all rights reserved.`;
export const FOLKLORE_PAGE =
  "Old folk tales describe bats as blind creatures that navigate only by sound. Many people still repeat the phrase blind as a bat in daily speech. " +
  "Some older pest-control guides state plainly that bats cannot see and depend entirely on echolocation to move around at night. " +
  "These guides were written decades ago and rarely cite any biological research for their claims about bat eyesight.";
export const ZOOLOGY_PAGE =
  "A zoology review found that microbats have small eyes with limited acuity, while megabats have large eyes and excellent night vision. " +
  "The review concluded that describing all bats as blind is inaccurate, though vision plays a smaller role for many insect-eating species. " +
  "Measurements came from retinal studies and behavioural tests across several continents and different habitats.";

export const pages: Record<string, string> = {
  "https://uni.example.edu/bats": PRESS_RELEASE,
  "https://news.example.com/bats-copy": SYNDICATED_COPY,
  "https://folk.example.org/blind": FOLKLORE_PAGE,
  "https://zoo.example.org/review": ZOOLOGY_PAGE,
};
const html = (text: string) => `<html><title>t</title><body><p>${text}</p></body></html>`;
export const fetcher = async (url: string): Promise<SafeFetchResult> =>
  pages[url]
    ? { finalUrl: url, status: 200, contentType: "text/html", body: html(pages[url]), truncated: false }
    : { finalUrl: url, status: 404, contentType: "text/html", body: "", truncated: false };

const hit = (url: string): SearchResult => ({ url, title: url, snippet: "", publisher: new URL(url).hostname, publishedAt: null, provider: "mock", knownType: null });

/** Returns different results for round-1 and follow-up queries. */
export function searchFor(round1: string[], followUp: string[]): SearchProvider {
  return {
    name: "mock",
    async search(query) {
      return (query.startsWith("follow-up") ? followUp : round1).map(hit);
    },
  };
}

export type Script = {
  pagesWithEvidence: Record<string, { quote: string; relation: string }[]>;
  fakeQuote?: boolean;
  /** Proposed verdict; omit to make the verdict step fail. */
  verdict?: { value: string; explanation: string };
  /** Extra statements returned by extraction, with their classification. */
  extraClaims?: { text: string; kind: string; verifiable: boolean; highImpact?: boolean }[];
};

/** Scripted AI: answers by schema name, and quotes only from pages it was actually shown. */
export function scriptedAI(script: Script): AIProvider & { calls: string[] } {
  const calls: string[] = [];
  let followUps = 0;
  return {
    name: "scripted",
    calls,
    async generateJson<T>({ schemaName, prompt }: JsonRequest<T>): Promise<T> {
      calls.push(schemaName);
      switch (schemaName) {
        case "claim_extraction":
          return { claims: [
            { text: "Bats are blind.", context: "", kind: "factual" },
            ...(script.extraClaims ?? []).map((c) => ({ text: c.text, context: "", kind: c.kind })),
          ] } as T;
        case "claim_classification":
          return { items: [
            { index: 0, category: "science", verifiable: true, reason: "Biology", highImpact: false },
            ...(script.extraClaims ?? []).map((c, i) => ({ index: i + 1, category: "other", verifiable: c.verifiable, reason: "A matter of taste.", highImpact: c.highImpact ?? false })),
          ] } as T;
        case "verdict":
          if (!script.verdict) throw new Error("verdict not scripted");
          return script.verdict as T;
        case "research_plan":
          return { plans: [{ index: 0, queries: [
            { stance: "supporting", question: "q", query: "bats blind" },
            { stance: "contradicting", question: "q", query: "bats can see" },
          ] }] } as T;
        case "follow_up_plan":
          // Numbered so a later re-check plans a query that differs from earlier ones.
          followUps += 1;
          return { queries: [{ stance: "contradicting", question: "q", query: `follow-up bat vision review ${followUps}` }] } as T;
        case "evidence_extraction": {
          const shown = [...prompt.matchAll(/<untrusted_page_(\d+)>\n[\s\S]*?\n\n([\s\S]*?)\n<\/untrusted_page_\d+>/g)];
          const sources = shown.map((m) => ({ index: Number(m[1]), isPrimary: m[2].includes("Researchers"), evaluation: "Assessed." }));
          const evidence = shown.flatMap((m) => {
            const entry = Object.entries(script.pagesWithEvidence).find(([marker]) => m[2].includes(marker));
            return (entry?.[1] ?? []).map((e) => ({ sourceIndex: Number(m[1]), quote: e.quote, relation: e.relation, explanation: "Explains.", limitations: "" }));
          });
          if (script.fakeQuote && shown.length) {
            evidence.push({ sourceIndex: 0, quote: "Bats were proven blind by a 2023 government report.", relation: "supports", explanation: "x", limitations: "" });
          }
          return { sources, evidence } as T;
        }
        case "contradiction_analysis":
          return { factors: ["newer_research", "source_quality"], explanation: "[3] relies on folklore while [1] reports field research." } as T;
        default:
          throw new Error(`unexpected schema ${schemaName}`);
      }
    },
  };
}

export const FOLK_QUOTE = { quote: "Some older pest-control guides state plainly that bats cannot see", relation: "supports" };
export const PRESS_QUOTE = { quote: "bats are not blind. All bat species have functional eyes", relation: "contradicts" };
export const ZOO_QUOTE = { quote: "describing all bats as blind is inaccurate", relation: "contradicts" };
export const ZOO_CONTEXT = { quote: "microbats have small eyes with limited acuity", relation: "provides_context" };
