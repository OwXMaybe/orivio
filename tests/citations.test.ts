import { describe, expect, it } from "vitest";
import { recheckInvestigation, runInvestigation } from "@/lib/research/engine";
import { quoteAppearsIn } from "@/lib/research/evidence";
import type { Investigation } from "@/types/investigation";
import { FOLK_QUOTE, PRESS_QUOTE, ZOO_CONTEXT, ZOO_QUOTE, fetcher, pages, scriptedAI, searchFor, type Script } from "./fixtures";

const UNI = "https://uni.example.edu/bats";
const COPY = "https://news.example.com/bats-copy";
const ZOO = "https://zoo.example.org/review";
const FOLK = "https://folk.example.org/blind";
const ALL_EVIDENCE = {
  "Researchers at the university": [PRESS_QUOTE],
  "zoology review": [ZOO_QUOTE, ZOO_CONTEXT],
  "Old folk tales": [FOLK_QUOTE],
};

/**
 * Invariants every report must satisfy, whatever the AI returns:
 * nothing quoted that the page does not contain, no citation to a source
 * without evidence for that claim, no dangling references.
 */
function assertCitationIntegrity(inv: Investigation) {
  const sourceById = new Map(inv.sources.map((s) => [s.id, s]));
  const claimIds = new Set(inv.claims.map((c) => c.id));
  const evidenceIds = new Set(inv.evidence.map((e) => e.id));

  for (const e of inv.evidence) {
    const source = sourceById.get(e.sourceId);
    expect(source, `evidence ${e.id} points to a missing source`).toBeDefined();
    expect(claimIds.has(e.claimId)).toBe(true);
    expect(source!.retrieval).toBe("retrieved");
    expect(quoteAppearsIn(e.quote, pages[source!.url]), `quote not in page: "${e.quote}"`).toBe(true);
  }

  for (const v of inv.verdicts) {
    expect(claimIds.has(v.claimId)).toBe(true);
    const allowed = new Set(
      inv.evidence.filter((e) => e.claimId === v.claimId).map((e) => inv.sources.findIndex((s) => s.id === e.sourceId) + 1),
    );
    for (const m of v.explanation.matchAll(/\[(\d+)\]/g)) {
      expect(allowed.has(Number(m[1])), `verdict cites [${m[1]}] without evidence for the claim`).toBe(true);
    }
    // Conclusive verdicts must cite at least one source.
    if (["true", "mostly_true", "misleading", "mostly_false", "false"].includes(v.value)) {
      expect(v.explanation).toMatch(/\[\d+\]/);
    }
  }

  for (const c of inv.contradictions) {
    for (const id of [...c.supportingEvidenceIds, ...c.contradictingEvidenceIds]) expect(evidenceIds.has(id)).toBe(true);
    for (const id of c.supportingEvidenceIds) expect(inv.evidence.find((e) => e.id === id)?.relation).toBe("supports");
    for (const id of c.contradictingEvidenceIds) expect(inv.evidence.find((e) => e.id === id)?.relation).toBe("contradicts");
  }

  for (const r of inv.revisions) {
    for (const id of r.newSourceIds) expect(sourceById.has(id)).toBe(true);
    for (const id of r.newEvidenceIds) expect(evidenceIds.has(id)).toBe(true);
  }
}

const scenarios: { name: string; urls: string[]; followUp?: string[]; script: Script }[] = [
  { name: "clean evidence", urls: [UNI, ZOO], script: { pagesWithEvidence: ALL_EVIDENCE, verdict: { value: "false", explanation: "[1] and [2] show bats can see." } } },
  { name: "invented quote", urls: [UNI, ZOO, FOLK], script: { pagesWithEvidence: ALL_EVIDENCE, fakeQuote: true, verdict: { value: "mostly_false", explanation: "[1] [2] [3]" } } },
  { name: "invented citations", urls: [UNI, ZOO], script: { pagesWithEvidence: ALL_EVIDENCE, verdict: { value: "false", explanation: "[1], [4] and [12] agree; [2] too." } } },
  { name: "uncited conclusion", urls: [UNI, ZOO], script: { pagesWithEvidence: ALL_EVIDENCE, verdict: { value: "true", explanation: "Everyone knows this." } } },
  { name: "syndicated copies", urls: [UNI, COPY], followUp: [ZOO], script: { pagesWithEvidence: ALL_EVIDENCE, verdict: { value: "false", explanation: "[1] [2] [3]" } } },
  { name: "no evidence at all", urls: [UNI], script: { pagesWithEvidence: {}, verdict: { value: "true", explanation: "[1]" } } },
];

describe("citation accuracy", () => {
  it.each(scenarios)("holds for: $name", async ({ urls, followUp, script }) => {
    const ai = scriptedAI(script);
    const inv = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai, search: [searchFor(urls, followUp ?? [])], fetcher });
    assertCitationIntegrity(inv);
  });

  it("holds after a re-check adds sources", async () => {
    const ai = scriptedAI({ pagesWithEvidence: ALL_EVIDENCE, verdict: { value: "false", explanation: "[1] [2] [3] [9]" } });
    const later: string[] = [];
    const search = {
      name: "mock",
      async search(query: string) {
        const list = query.startsWith("follow-up") ? later : [UNI];
        return list.map((url) => ({ url, title: url, snippet: "", publisher: null, publishedAt: null, provider: "mock", knownType: null }));
      },
    };
    const first = await runInvestigation({ input: "Bats are blind.", researchLanguage: "en" }, { ai, search: [search], fetcher });
    later.push(ZOO, FOLK);
    const second = await recheckInvestigation(first, { ai, search: [search], fetcher });
    assertCitationIntegrity(second);
    expect(second.revisions).toHaveLength(1);
  });
});
