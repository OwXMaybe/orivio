"use client";

import type { Language } from "@/types/investigation";

/**
 * Hands an input from one page to /investigate without putting it in the URL
 * (claims can be personal; URLs end up in history and logs).
 */
const KEY = "orivio.pending";

export function setPendingInput(input: string, researchLanguage: Language): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ input, researchLanguage }));
  } catch {
    // Without sessionStorage the investigate page simply opens empty.
  }
}

export function takePendingInput(): { input: string; researchLanguage: Language } | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { input?: unknown; researchLanguage?: unknown };
    if (typeof parsed.input !== "string") return null;
    return { input: parsed.input, researchLanguage: parsed.researchLanguage === "en" ? "en" : "tr" };
  } catch {
    return null;
  }
}
