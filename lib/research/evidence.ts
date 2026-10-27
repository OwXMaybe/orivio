import { z } from "zod";
import { UNTRUSTED_NOTICE, untrusted, type AIProvider } from "../ai/types";
import type { Claim } from "@/types/claim";
import { EVIDENCE_RELATIONS, type Evidence } from "@/types/evidence";
import type { Source } from "@/types/source";

/** Sources sent to the model per claim and per round, to bound cost and context. */
export const MAX_SOURCES_PER_CALL = 6;
const EXCERPT_CHARS_FOR_AI = 3500;
const MIN_QUOTE_CHARS = 20;
const MAX_QUOTE_CHARS = 600;

const extractionSchema = z.object({
  sources: z.array(
    z.object({
      index: z.number().int(),
      isPrimary: z.boolean().describe("True if the page is an original study, dataset, official record or first-hand account"),
      evaluation: z.string().describe("One or two sentences: expertise of the publisher, methodology limits, whether the date matters for this claim"),
    }),
  ),
  evidence: z.array(
    z.object({
      sourceIndex: z.number().int(),
      quote: z.string().describe("A passage copied character-for-character from that source's text, 1-3 sentences"),
      relation: z.enum(EVIDENCE_RELATIONS),
      explanation: z.string().describe("How the passage bears on the claim, without going beyond what it says"),
      limitations: z.string().describe("What the passage does not establish; empty if nothing notable"),
    }),
  ),
});

const SYSTEM = `You are the evidence-extraction and source-evaluation stage of ORIVIO, an evidence verification lab.
You receive one claim and the text of several web pages. For each page:
1. Evaluate it: is it a primary source? What are its expertise, methodological limits and date relevance?
2. Copy passages that bear on the claim. A quote MUST be copied exactly from that page's text — never paraphrase, merge, translate or complete it. Quotes that are not found verbatim are discarded automatically.
3. Label each passage: supports, contradicts, provides_context (relevant background that neither confirms nor refutes), or challenges_methodology (questions how the evidence for the claim was produced).
Use only the page text given. Do not use outside knowledge to create evidence. If a page has nothing relevant, return no evidence for it.
Be equally careful with supporting and contradicting passages.
${UNTRUSTED_NOTICE}`;

/** Makes quote matching tolerant of whitespace, quote-mark and dash styles only. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

export function quoteAppearsIn(quote: string, sourceText: string): boolean {
  const q = normalizeForMatch(quote);
  return q.length >= MIN_QUOTE_CHARS && q.length <= MAX_QUOTE_CHARS && normalizeForMatch(sourceText).includes(q);
}

export type SourceEvaluation = { isPrimary: boolean; notes: string };

export type ExtractionOutcome = {
  evidence: Evidence[];
  evaluations: Map<string, SourceEvaluation>;
  /** Quotes the model returned that could not be found in the source text. */
  rejectedQuotes: number;
};

/** Retrieved sources that were found by this claim's queries. */
export function sourcesForClaim(claim: Claim, sources: Source[], queryIdsForClaim: Set<string>): Source[] {
  return sources.filter((s) => s.retrieval === "retrieved" && s.excerpt && s.queryIds.some((id) => queryIdsForClaim.has(id)));
}

export async function extractEvidence(ai: AIProvider, claim: Claim, sources: Source[], round: number): Promise<ExtractionOutcome> {
  const batch = sources.filter((s) => s.excerpt).slice(0, MAX_SOURCES_PER_CALL);
  const outcome: ExtractionOutcome = { evidence: [], evaluations: new Map(), rejectedQuotes: 0 };
  if (!batch.length) return outcome;

  const pages = batch
    .map((s, i) => untrusted(`page_${i}`, `Publisher: ${s.publisher}\nTitle: ${s.title}\nPublished: ${s.publishedAt ?? "not stated"}\n\n${(s.excerpt ?? "").slice(0, EXCERPT_CHARS_FOR_AI)}`))
    .join("\n\n");
  const result = await ai.generateJson({
    system: SYSTEM,
    prompt: `Claim to investigate:\n${untrusted("claim", claim.context ? `${claim.text}\n(context: ${claim.context})` : claim.text)}\n\nPages (index = page number):\n${pages}`,
    schema: extractionSchema,
    schemaName: "evidence_extraction",
  });

  for (const item of result.sources) {
    const source = batch[item.index];
    if (source) outcome.evaluations.set(source.id, { isPrimary: item.isPrimary, notes: item.evaluation.trim() });
  }

  const seen = new Set<string>();
  for (const item of result.evidence) {
    const source = batch[item.sourceIndex];
    if (!source?.excerpt) continue;
    // Verify against exactly the text the model was shown.
    if (!quoteAppearsIn(item.quote, source.excerpt.slice(0, EXCERPT_CHARS_FOR_AI))) {
      outcome.rejectedQuotes += 1;
      continue;
    }
    const key = `${source.id}|${normalizeForMatch(item.quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    outcome.evidence.push({
      id: crypto.randomUUID(),
      claimId: claim.id,
      sourceId: source.id,
      quote: item.quote.replace(/\s+/g, " ").trim(),
      relation: item.relation,
      explanation: item.explanation.trim(),
      limitations: item.limitations.trim(),
      round,
    });
  }
  return outcome;
}
