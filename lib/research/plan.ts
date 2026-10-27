import { z } from "zod";
import { UNTRUSTED_NOTICE, untrusted, type AIProvider } from "../ai/types";
import type { Claim, ResearchQuery, ResearchStance } from "@/types/claim";
import type { Language } from "@/types/investigation";

/** Only the most central verifiable claims are researched, to bound cost. */
export const MAX_RESEARCHED_CLAIMS = 3;
export const MAX_ROUNDS = 2;

const planSchema = z.object({
  plans: z.array(
    z.object({
      index: z.number().int(),
      queries: z
        .array(
          z.object({
            stance: z.enum(["supporting", "contradicting", "context"]),
            question: z.string().describe("The research question this query answers"),
            query: z.string().describe("A concise web search query, under 12 words"),
          }),
        )
        .max(5),
    }),
  ),
});

const SYSTEM = `You are the research-planning stage of ORIVIO, an evidence verification lab.
For each numbered claim, write a balanced plan: at least one query looking for supporting evidence,
at least one looking for contradicting evidence or debunks, and optionally one for context
(original data, official statistics, the primary source). Prefer queries likely to surface
academic, governmental, research and fact-checking sources. Write queries in the requested language.
${UNTRUSTED_NOTICE}`;

export function researchableClaims(claims: Claim[]): Claim[] {
  return claims.filter((c) => c.verifiable).slice(0, MAX_RESEARCHED_CLAIMS);
}

export async function planResearchWithAI(ai: AIProvider, claims: Claim[], language: Language): Promise<ResearchQuery[]> {
  const targets = researchableClaims(claims);
  if (!targets.length) return [];
  const numbered = targets.map((c, i) => `${i}. ${c.text}`).join("\n");
  const result = await ai.generateJson({
    system: SYSTEM,
    prompt: `Query language: ${language === "tr" ? "Turkish" : "English"}.\n\n${untrusted("claims", numbered)}`,
    schema: planSchema,
    schemaName: "research_plan",
  });
  const queries = result.plans.flatMap((plan) => {
    const claim = targets[plan.index];
    if (!claim) return [];
    return plan.queries.map((q) => makeQuery(claim.id, q.question, q.query, q.stance));
  });
  // Guarantee balance even if the model skipped a side.
  for (const claim of targets) {
    for (const stance of ["supporting", "contradicting"] as const) {
      if (!queries.some((q) => q.claimId === claim.id && q.stance === stance)) {
        queries.push(...templateQueries(claim, language).filter((q) => q.stance === stance));
      }
    }
  }
  return queries;
}

const TEMPLATES: Record<Language, Record<ResearchStance, { question: string; suffix: string }>> = {
  en: {
    supporting: { question: "What evidence supports this claim?", suffix: "evidence study" },
    contradicting: { question: "What evidence contradicts or debunks this claim?", suffix: "false myth debunked" },
    context: { question: "Have fact-checkers or official sources addressed this?", suffix: "fact check" },
  },
  tr: {
    supporting: { question: "Bu iddiayı hangi kanıtlar destekliyor?", suffix: "kanıt araştırma" },
    contradicting: { question: "Bu iddiayı hangi kanıtlar çürütüyor?", suffix: "yanlış asılsız" },
    context: { question: "Doğrulama kuruluşları veya resmî kaynaklar bunu ele aldı mı?", suffix: "doğruluk kontrolü" },
  },
};

function makeQuery(claimId: string, question: string, query: string, stance: ResearchStance, round = 1): ResearchQuery {
  return { id: crypto.randomUUID(), claimId, question, query: query.trim().slice(0, 300), stance, round };
}

function compact(text: string): string {
  return text.replace(/[?!."“”]+/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 14).join(" ");
}

/** A claim needs another round when fewer than this many independent sources address it directly. */
export const MIN_INDEPENDENT_EVIDENCE = 2;
export const MAX_FOLLOW_UP_QUERIES = 3;

const followUpSchema = z.object({
  queries: z
    .array(
      z.object({
        stance: z.enum(["supporting", "contradicting", "context"]),
        question: z.string(),
        query: z.string().describe("A concise web search query, under 12 words, different from earlier queries"),
      }),
    )
    .max(MAX_FOLLOW_UP_QUERIES),
});

const FOLLOW_UP_SYSTEM = `You are the additional-research stage of ORIVIO, an evidence verification lab.
The first search round did not produce enough independent evidence for a claim. Write up to ${MAX_FOLLOW_UP_QUERIES} new search
queries that target the gap: primary sources (original studies, official statistics, records), the side with no evidence yet,
or more precise wording. Do not repeat earlier queries. Write queries in the requested language.
${UNTRUSTED_NOTICE}`;

export type EvidenceTally = { supports: number; contradicts: number; context: number };

export async function planFollowUpWithAI(
  ai: AIProvider,
  claim: Claim,
  previous: ResearchQuery[],
  tally: EvidenceTally,
  language: Language,
  round: number,
): Promise<ResearchQuery[]> {
  const result = await ai.generateJson({
    system: FOLLOW_UP_SYSTEM,
    prompt: [
      `Query language: ${language === "tr" ? "Turkish" : "English"}.`,
      `Claim:\n${untrusted("claim", claim.text)}`,
      `Earlier queries:\n${untrusted("queries", previous.map((q) => `- (${q.stance}) ${q.query}`).join("\n"))}`,
      `Independent sources found so far: ${tally.supports} supporting, ${tally.contradicts} contradicting, ${tally.context} context-only.`,
    ].join("\n\n"),
    schema: followUpSchema,
    schemaName: "follow_up_plan",
  });
  const seen = new Set(previous.map((q) => q.query.toLocaleLowerCase()));
  return result.queries
    .filter((q) => q.query.trim() && !seen.has(q.query.trim().toLocaleLowerCase()))
    .slice(0, MAX_FOLLOW_UP_QUERIES)
    .map((q) => makeQuery(claim.id, q.question, q.query, q.stance, round));
}

/** Deterministic, balanced plan used without an AI provider. */
export function templateQueries(claim: Claim, language: Language): ResearchQuery[] {
  const base = compact(claim.text);
  const t = TEMPLATES[language];
  return (["supporting", "contradicting", "context"] as const).map((stance) =>
    makeQuery(claim.id, t[stance].question, stance === "supporting" ? base : `${base} ${t[stance].suffix}`, stance),
  );
}

export function planResearchTemplate(claims: Claim[], language: Language): ResearchQuery[] {
  return researchableClaims(claims).flatMap((c) => templateQueries(c, language));
}
