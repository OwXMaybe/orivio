import type { SourceType } from "@/types/source";

const FACT_CHECKERS = [
  "snopes.com", "politifact.com", "factcheck.org", "fullfact.org", "teyit.org", "dogrulukpayi.com",
  "malumatfurus.org", "factcheck.afp.com", "leadstories.com", "checkyourfact.com", "healthfeedback.org",
  "sciencefeedback.co", "climatefeedback.org", "africacheck.org", "maldita.es", "correctiv.org",
];
const ACADEMIC = [
  "arxiv.org", "doi.org", "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "scholar.google.com",
  "nature.com", "science.org", "sciencedirect.com", "springer.com", "link.springer.com", "wiley.com",
  "onlinelibrary.wiley.com", "jstor.org", "plos.org", "journals.plos.org", "thelancet.com", "nejm.org",
  "bmj.com", "cell.com", "pnas.org", "frontiersin.org", "mdpi.com", "tandfonline.com", "dergipark.org.tr",
  "semanticscholar.org", "researchgate.net",
];
const RESEARCH_ORGS = [
  "who.int", "pewresearch.org", "rand.org", "brookings.edu", "ourworldindata.org", "worldbank.org",
  "imf.org", "oecd.org", "ipcc.ch", "cochrane.org", "cochranelibrary.com", "nasa.gov", "noaa.gov", "cern.ch",
];
const NEWS = [
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "nytimes.com", "theguardian.com", "washingtonpost.com",
  "ft.com", "economist.com", "bloomberg.com", "npr.org", "aljazeera.com", "dw.com", "france24.com",
  "aa.com.tr", "trthaber.com", "hurriyet.com.tr", "milliyet.com.tr", "sozcu.com.tr", "cumhuriyet.com.tr",
  "bianet.org", "t24.com.tr", "ntv.com.tr", "cnnturk.com", "euronews.com",
];

const matches = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

/** Domain-based first pass. Phase 3 source evaluation refines this per page. */
export function classifySourceType(url: string): SourceType {
  let host: string;
  let path: string;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase().replace(/^www\./, "");
    path = u.pathname.toLowerCase();
  } catch {
    return "other";
  }
  if (matches(host, FACT_CHECKERS) || /fact-?check|dogrulama/.test(path)) return "fact_checker";
  if (matches(host, RESEARCH_ORGS)) return "research_organization";
  // Explicit lists beat generic TLD rules (e.g. PubMed lives on nih.gov).
  if (matches(host, ACADEMIC)) return "academic";
  if (/\.(gov|mil)(\.[a-z]{2})?$/.test(host) || host.endsWith(".europa.eu") || host === "europa.eu" || /\.gov\.tr$|\.bel\.tr$|\.tbmm\.gov\.tr$/.test(host)) {
    return "government";
  }
  if (/\.edu(\.[a-z]{2})?$|\.ac\.[a-z]{2}$/.test(host)) return "academic";
  if (matches(host, NEWS)) return "news";
  return "other";
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Normalizes a URL for de-duplication: drops fragments, tracking params and trailing slashes. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|ref_src)/i.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}
