import { z } from "zod";
import { UNTRUSTED_NOTICE, untrusted, type AIProvider } from "../ai/types";
import { CLAIM_CATEGORIES, type Claim, type ClaimCategory } from "@/types/claim";
import type { ExtractedClaim } from "./extract";

const classificationSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      category: z.enum(CLAIM_CATEGORIES),
      verifiable: z.boolean(),
      reason: z.string().describe("One sentence: why this can or cannot be checked against evidence"),
      highImpact: z.boolean().describe("True for health, legal, financial or safety-critical claims"),
    }),
  ),
});

const SYSTEM = `You are the classification stage of ORIVIO, an evidence verification lab.
For each numbered statement choose one category: ${CLAIM_CATEGORIES.join(", ")}.
Decide whether it is verifiable: could public evidence in principle confirm or refute it?
Opinions, value judgements and unfalsifiable statements are not verifiable. Predictions are verifiable only if they concern something that has already happened.
Mark highImpact for health, legal, financial and safety topics.
${UNTRUSTED_NOTICE}`;

const HIGH_IMPACT: ClaimCategory[] = ["health", "economy"];

export async function classifyClaimsWithAI(ai: AIProvider, claims: ExtractedClaim[]): Promise<Claim[]> {
  const numbered = claims.map((c, i) => `${i}. [${c.kind}] ${c.text}${c.context ? ` (context: ${c.context})` : ""}`).join("\n");
  const result = await ai.generateJson({
    system: SYSTEM,
    prompt: `Classify these statements.\n\n${untrusted("statements", numbered)}`,
    schema: classificationSchema,
    schemaName: "claim_classification",
  });
  const byIndex = new Map(result.items.map((item) => [item.index, item]));
  return claims.map((c, i) => {
    const item = byIndex.get(i);
    return {
      id: crypto.randomUUID(),
      text: c.text,
      context: c.context,
      kind: c.kind,
      category: item?.category ?? "other",
      verifiable: item ? item.verifiable && c.kind !== "opinion" : false,
      verifiabilityReason: item?.reason ?? "classifier_missing",
      highImpact: item ? item.highImpact || HIGH_IMPACT.includes(item.category) : false,
    };
  });
}

/**
 * Without an AI provider the category is left as "other" rather than guessed;
 * verifiability follows only from the statement kind.
 */
export function classifyClaimsHeuristic(claims: ExtractedClaim[]): Claim[] {
  return claims.map((c) => ({
    id: crypto.randomUUID(),
    text: c.text,
    context: c.context,
    kind: c.kind,
    category: "other",
    verifiable: c.kind === "factual" || c.kind === "question",
    verifiabilityReason: `heuristic_${c.kind}`,
    highImpact: false,
  }));
}
