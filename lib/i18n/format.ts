import type { Language } from "@/types/investigation";
import type { Dictionary } from "./dictionaries";

export function formatDate(iso: string | null, language: Language, withTime = false): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso; // keep provider-reported text as-is
  return date.toLocaleString(language === "tr" ? "tr-TR" : "en-GB", {
    year: "numeric", month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Limitation codes may carry a suffix (e.g. "search_failure:brave: …"). */
export function describeLimitation(code: string, t: Dictionary): string {
  const [key, ...rest] = code.split(":");
  const base = t.limitation[key] ?? code;
  return rest.length ? `${base}: ${rest.join(":").trim()}` : base;
}

export function formatTime(iso: string, language: Language): string {
  return new Date(iso).toLocaleTimeString(language === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
