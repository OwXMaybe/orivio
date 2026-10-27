"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Language } from "@/types/investigation";
import { dictionaries, type Dictionary } from "./dictionaries";
import { PREFS_KEY } from "./theme-boot";

export type Theme = "dark" | "light";
export type Preferences = { language: Language; theme: Theme; researchLanguage: Language };

const KEY = PREFS_KEY;
const DEFAULTS: Preferences = { language: "tr", theme: "dark", researchLanguage: "tr" };

let cache: Preferences | null = null;
const listeners = new Set<() => void>();

function read(): Preferences {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Preferences>) : {};
    cache = {
      language: parsed.language === "en" || parsed.language === "tr" ? parsed.language : DEFAULTS.language,
      theme: parsed.theme === "light" ? "light" : "dark",
      researchLanguage: parsed.researchLanguage === "en" || parsed.researchLanguage === "tr" ? parsed.researchLanguage : parsed.language === "en" ? "en" : DEFAULTS.researchLanguage,
    };
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type ContextValue = Preferences & { t: Dictionary; set: (patch: Partial<Preferences>) => void };
const PreferencesContext = createContext<ContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULTS);

  const set = useCallback((patch: Partial<Preferences>) => {
    cache = { ...read(), ...patch };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      // Preference still applies for this session.
    }
    listeners.forEach((l) => l());
  }, []);

  useEffect(() => {
    document.documentElement.lang = prefs.language;
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.language, prefs.theme]);

  const value = useMemo(() => ({ ...prefs, t: dictionaries[prefs.language], set }), [prefs, set]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): ContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}

