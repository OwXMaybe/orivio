const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function meta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`,
      "i",
    );
    const m = re.exec(html);
    const value = m?.[1] ?? m?.[2];
    if (value?.trim()) return decodeEntities(value.trim());
  }
  return null;
}

export type ExtractedPage = {
  title: string | null;
  siteName: string | null;
  author: string | null;
  publishedAt: string | null;
  text: string;
};

/**
 * Converts untrusted HTML to plain text. The output is data only: it is never
 * rendered as HTML and is fenced off as untrusted when passed to an AI model.
 */
export function extractPage(html: string, maxChars = 20_000): ExtractedPage {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, maxChars);

  return {
    title: titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim() || null : null,
    siteName: meta(html, ["og:site_name", "application-name"]),
    author: meta(html, ["author", "article:author", "parsely-author"]),
    publishedAt: meta(html, ["article:published_time", "datePublished", "pubdate", "date", "dc.date"]),
    text,
  };
}
