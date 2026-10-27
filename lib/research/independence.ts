import type { Evidence, EvidenceRelation } from "@/types/evidence";
import type { Source } from "@/types/source";
import { normalizeForMatch } from "./evidence";

const SHINGLE_WORDS = 5;
/** Share of the shorter text's word sequences that also occur in the other. */
export const DUPLICATE_THRESHOLD = 0.5;
const MIN_SHINGLES = 20;

function shingles(text: string): Set<string> {
  const words = normalizeForMatch(text).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE_WORDS <= words.length; i++) out.add(words.slice(i, i + SHINGLE_WORDS).join(" "));
  return out;
}

export function textOverlap(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  const smaller = sa.size <= sb.size ? sa : sb;
  const larger = smaller === sa ? sb : sa;
  if (smaller.size < MIN_SHINGLES) return 0;
  let shared = 0;
  for (const s of smaller) if (larger.has(s)) shared += 1;
  return shared / smaller.size;
}

/**
 * Groups retrieved sources whose text is largely the same (syndicated copies,
 * one press release on many sites). Each group counts as one independent source.
 * Sources that were not retrieved cannot be compared and get no group.
 */
export function assignIndependenceGroups(sources: Source[]): Source[] {
  const comparable = sources.filter((s) => s.retrieval === "retrieved" && s.excerpt);
  const parent = new Map(comparable.map((s) => [s.id, s.id]));
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  for (let i = 0; i < comparable.length; i++) {
    for (let j = i + 1; j < comparable.length; j++) {
      if (textOverlap(comparable[i].excerpt!, comparable[j].excerpt!) >= DUPLICATE_THRESHOLD) {
        parent.set(find(comparable[j].id), find(comparable[i].id));
      }
    }
  }
  return sources.map((s) => (parent.has(s.id) ? { ...s, independenceGroup: find(s.id) } : { ...s, independenceGroup: null }));
}

/** Number of independent sources behind a claim's evidence of a given relation. */
export function independentCount(evidence: Evidence[], sources: Source[], claimId: string, relation: EvidenceRelation): number {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const groups = new Set(
    evidence
      .filter((e) => e.claimId === claimId && e.relation === relation)
      .map((e) => byId.get(e.sourceId)?.independenceGroup ?? e.sourceId),
  );
  return groups.size;
}
