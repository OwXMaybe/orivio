import type { ClaimCategory } from "@/types/claim";
import type { Investigation } from "@/types/investigation";
import { CONCLUSIVE_VERDICTS, type VerdictValue } from "@/types/verdict";

export type InvestigationStats = {
  total: number;
  verifiedClaims: number;
  sourcesDiscovered: number;
  sourcesRetrieved: number;
  reports: number;
  byCategory: Partial<Record<ClaimCategory, number>>;
  byVerdict: Partial<Record<VerdictValue, number>>;
  perDay: { day: string; count: number }[];
};

/** Everything here is derived from the user's own stored investigations. */
export function computeStats(investigations: Investigation[], days = 14, now = new Date()): InvestigationStats {
  const byCategory: InvestigationStats["byCategory"] = {};
  const byVerdict: InvestigationStats["byVerdict"] = {};
  let verifiedClaims = 0;
  let sourcesDiscovered = 0;
  let sourcesRetrieved = 0;
  let reports = 0;

  for (const inv of investigations) {
    byCategory[inv.primaryCategory] = (byCategory[inv.primaryCategory] ?? 0) + 1;
    for (const v of inv.verdicts) {
      byVerdict[v.value] = (byVerdict[v.value] ?? 0) + 1;
      if (CONCLUSIVE_VERDICTS.includes(v.value)) verifiedClaims += 1;
    }
    sourcesDiscovered += inv.sources.length;
    sourcesRetrieved += inv.sources.filter((s) => s.retrieval === "retrieved").length;
    if (inv.events.some((e) => e.stage === "report_generated" && e.status === "completed")) reports += 1;
  }

  const perDay: InvestigationStats["perDay"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    perDay.push({
      day: d.toISOString(),
      count: investigations.filter((inv) => {
        const at = new Date(inv.createdAt);
        return at >= d && at < next;
      }).length,
    });
  }

  return { total: investigations.length, verifiedClaims, sourcesDiscovered, sourcesRetrieved, reports, byCategory, byVerdict, perDay };
}
