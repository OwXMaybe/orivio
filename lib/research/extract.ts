import { z } from "zod";
import { UNTRUSTED_NOTICE, untrusted, type AIProvider } from "../ai/types";
import type { ClaimKind } from "@/types/claim";

export const MAX_CLAIMS = 5;

export type ExtractedClaim = { text: string; context: string; kind: ClaimKind };

const extractionSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().describe("One self-contained statement, close to the original wording"),
        context: z.string().describe("Context from the input needed to interpret the statement; empty if none"),
        kind: z.enum(["factual", "opinion", "prediction", "question"]),
      }),
    )
    .max(MAX_CLAIMS),
});

const SYSTEM = `You are the claim-extraction stage of ORIVIO, an evidence verification lab.
Split the input into separate statements that could each be investigated.
- Keep each statement faithful to the input; do not add facts, numbers or names that are not in it.
- Label each as factual (checkable against evidence), opinion, prediction, or question.
- A question that asks whether something is true counts as "question".
- Preserve context such as time, place and who said it.
- Return at most ${MAX_CLAIMS} statements, most central first.
${UNTRUSTED_NOTICE}`;

export async function extractClaimsWithAI(ai: AIProvider, input: string): Promise<ExtractedClaim[]> {
  const result = await ai.generateJson({
    system: SYSTEM,
    prompt: `Extract the statements from this input.\n\n${untrusted("input", input)}`,
    schema: extractionSchema,
    schemaName: "claim_extraction",
  });
  return result.claims.filter((c) => c.text.trim().length > 0);
}

const OPINION_MARKERS = [
  /\b(i think|i believe|in my opinion|should|ought to|the best|the worst|beautiful|ugly)\b/i,
  /\b(bence|bana göre|kanımca|en iyi|en kötü|güzel|çirkin)\b/i,
  /(malı|meli)(dır|dir|yız|yiz)?\b/i,
];
const PREDICTION_MARKERS = [/\b(will|is going to|by 20\d\d)\b/i, /(acak|ecek)(tır|tir|lar|ler)?\b/i];

function classifyKind(sentence: string): ClaimKind {
  if (sentence.trim().endsWith("?")) return "question";
  if (OPINION_MARKERS.some((re) => re.test(sentence))) return "opinion";
  if (PREDICTION_MARKERS.some((re) => re.test(sentence))) return "prediction";
  return "factual";
}

/**
 * Rule-based fallback used when no AI provider is configured. It only splits
 * sentences and flags obvious opinion/prediction wording; it never invents text.
 */
export function extractClaimsHeuristic(input: string): ExtractedClaim[] {
  const normalized = input.replace(/\s+/g, " ").trim();
  const sentences = normalized
    .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9"“])/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  const picked = (sentences.length ? sentences : [normalized]).slice(0, MAX_CLAIMS);
  return picked.map((text) => ({ text, context: "", kind: classifyKind(text) }));
}
