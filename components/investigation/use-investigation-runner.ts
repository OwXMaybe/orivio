"use client";

import { useCallback, useRef, useState } from "react";
import { saveInvestigation } from "@/lib/database/investigations-store";
import type { EngineMessage, Investigation, InvestigationEvent, Language } from "@/types/investigation";

export type RunnerState = {
  busy: boolean;
  events: InvestigationEvent[];
  result: Investigation | null;
  /** Error code, localized by the caller. */
  error: string | null;
  persisted: boolean;
};

const INITIAL: RunnerState = { busy: false, events: [], result: null, error: null, persisted: false };

/** Calls the engine and consumes its NDJSON stream; events arrive as stages really finish. */
export function useInvestigationRunner() {
  const [state, setState] = useState<RunnerState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (endpoint: string, body: unknown) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...INITIAL, busy: true });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setState((s) => ({ ...s, busy: false, error: data.error ?? "generic" }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const message = JSON.parse(line) as EngineMessage;
          if (message.type === "event") {
            setState((s) => ({ ...s, events: [...s.events, message.event] }));
          } else if (message.type === "result") {
            const persisted = await saveInvestigation(message.investigation);
            setState((s) => ({ ...s, result: message.investigation, persisted }));
          } else {
            setState((s) => ({ ...s, error: message.error }));
          }
        }
      }
      setState((s) => ({ ...s, busy: false, error: s.result || s.error ? s.error : "engine_failed" }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((s) => ({ ...s, busy: false, error: error instanceof TypeError ? "network" : "generic" }));
    }
  }, []);

  const run = useCallback(
    (input: string, researchLanguage: Language) => stream("/api/investigate", { input, researchLanguage }),
    [stream],
  );
  /** Re-checks a stored investigation; the result replaces it, with a new revision recorded. */
  const recheck = useCallback(
    (investigation: Investigation) => stream("/api/investigate/recheck", { investigation }),
    [stream],
  );

  return { ...state, run, recheck };
}
