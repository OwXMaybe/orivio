"use client";

import { useEffect, useState } from "react";

export type EngineStatus = {
  demoMode: boolean;
  ai: { provider: string; model: string } | null;
  search: string[];
  database: string;
};

/** Which providers the server has configured (names only, never keys). Null while loading or on error. */
export function useEngineStatus(): { status: EngineStatus | null; failed: boolean } {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/status")
      .then((r) => (r.ok ? (r.json() as Promise<EngineStatus>) : Promise.reject()))
      .then((s) => active && setStatus(s))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);
  return { status, failed };
}
