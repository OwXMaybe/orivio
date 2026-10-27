"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds only; in development it
 * would serve stale code during hot reloads.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline support is an enhancement; the app works without it.
    });
  }, []);
  return null;
}
