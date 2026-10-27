"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import type { Investigation } from "@/types/investigation";

/**
 * Single source of investigations for the UI, with two backends:
 * - local: this browser's localStorage (signed out);
 * - remote: the signed-in user's rows in Supabase, protected by RLS.
 * The UI reads one in-memory list; writes go to the active backend.
 */
type Backend = { kind: "local" } | { kind: "remote"; client: SupabaseClient; userId: string };
export type StoreStatus = "loading" | "ready" | "error";

const LOCAL_KEY = "orivio.investigations.v1";
const EMPTY: Investigation[] = [];

let backend: Backend = { kind: "local" };
let items: Investigation[] | null = null;
let status: StoreStatus = "loading";
/** Machine-readable code of the last failed remote operation, localized by the UI. */
let lastError: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Fills fields added after a record was saved, so older records keep working. */
export function upgrade(inv: Investigation): Investigation {
  return {
    ...inv,
    contradictions: inv.contradictions ?? [],
    revisions: inv.revisions ?? [],
    updatedAt: inv.updatedAt ?? inv.createdAt,
    verdicts: (inv.verdicts ?? []).map((v) => ({ ...v, confidenceFactors: v.confidenceFactors ?? [], adjustedFrom: v.adjustedFrom ?? null, rule: v.rule ?? null, assessedAt: v.assessedAt ?? inv.createdAt })),
    rounds: inv.rounds ?? (inv.sources.length ? 1 : 0),
    evidence: (inv.evidence ?? []).map((e) => ({ ...e, round: e.round ?? 1 })),
    sources: inv.sources.map((s) => ({ ...s, independenceGroup: s.independenceGroup ?? null, evaluationNotes: s.evaluationNotes ?? null })),
  };
}

// ── Local persistence ─────────────────────────────────────────────────────

export function readLocal(): Investigation[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Investigation[]).map(upgrade) : [];
  } catch {
    return [];
  }
}

function writeLocal(next: Investigation[]): boolean {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal(): void {
  writeLocal([]);
  if (backend.kind === "local") {
    items = [];
    notify();
  }
}

// ── Backend switching ─────────────────────────────────────────────────────

/** Called by the auth provider whenever the session changes. */
export async function switchBackend(next: Backend): Promise<void> {
  const same =
    (next.kind === "local" && backend.kind === "local") ||
    (next.kind === "remote" && backend.kind === "remote" && next.userId === backend.userId);
  if (same && items) return;
  backend = next;
  lastError = null;
  if (next.kind === "local") {
    items = readLocal();
    status = "ready";
    notify();
    return;
  }
  items = null;
  status = "loading";
  notify();
  const { data, error } = await next.client.rpc("list_my_investigations");
  if (backend !== next) return; // session changed while loading
  if (error) {
    items = [];
    status = "error";
    lastError = "load_failed";
  } else {
    items = ((data as Investigation[] | null) ?? []).map(upgrade);
    status = "ready";
  }
  notify();
}

export function backendKind(): Backend["kind"] {
  return backend.kind;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_KEY && backend.kind === "local") {
      items = readLocal();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function snapshot(): Investigation[] {
  if (!items && backend.kind === "local") {
    items = readLocal();
    status = "ready";
  }
  return items ?? EMPTY;
}

/** The current list outside React (e.g. for tests). */
export function currentInvestigations(): Investigation[] {
  return snapshot();
}

export function useInvestigations(): Investigation[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** "loading" during server render, hydration and remote loads; pages show a loading state instead of a false empty state. */
export function useStoreStatus(): StoreStatus {
  return useSyncExternalStore(
    subscribe,
    () => {
      snapshot();
      return status;
    },
    () => "loading" as const,
  );
}

export function useStoreReady(): boolean {
  return useStoreStatus() === "ready";
}

export function useStoreError(): string | null {
  return useSyncExternalStore(subscribe, () => lastError, () => null);
}

// ── Writes ────────────────────────────────────────────────────────────────

function setItems(next: Investigation[]) {
  items = next;
  notify();
}

/** Remote save of one investigation document; the database checks ownership. */
async function saveRemote(client: SupabaseClient, inv: Investigation): Promise<boolean> {
  const doc: Investigation = { ...inv };
  delete doc.shareToken; // sharing is changed only through updateInvestigation
  const { error } = await client.rpc("save_investigation", { doc });
  return !error;
}

/** Adds or replaces an investigation. Returns false if it could not be persisted. */
export async function saveInvestigation(inv: Investigation): Promise<boolean> {
  const current = snapshot();
  const existing = current.find((i) => i.id === inv.id);
  const merged = { ...inv, favorite: existing?.favorite ?? inv.favorite, shareToken: existing?.shareToken ?? null };
  setItems([merged, ...current.filter((i) => i.id !== inv.id)]);
  if (backend.kind === "local") return writeLocal(snapshot());
  const ok = await saveRemote(backend.client, merged);
  if (!ok) {
    lastError = "save_failed";
    notify();
  }
  return ok;
}

export async function updateInvestigation(id: string, patch: Partial<Pick<Investigation, "favorite" | "shareToken">>): Promise<boolean> {
  const before = snapshot();
  setItems(before.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  if (backend.kind === "local") return writeLocal(snapshot());
  const row: Record<string, unknown> = {};
  if (patch.favorite !== undefined) row.favorite = patch.favorite;
  if (patch.shareToken !== undefined) {
    row.share_token = patch.shareToken;
    row.visibility = patch.shareToken ? "link" : "private";
  }
  // RLS turns an update of someone else's (or a missing) row into "0 rows", not an error.
  const { data, error } = await backend.client.from("investigations").update(row).eq("id", id).select("id");
  const ok = !error && (data?.length ?? 0) === 1;
  if (!ok) {
    lastError = "save_failed";
    setItems(before); // show the state that is actually stored
  }
  return ok;
}

export async function deleteInvestigation(id: string): Promise<boolean> {
  const before = snapshot();
  setItems(before.filter((i) => i.id !== id));
  if (backend.kind === "local") return writeLocal(snapshot());
  const { error } = await backend.client.from("investigations").delete().eq("id", id);
  if (error) {
    setItems(before); // the row still exists; show it again
    lastError = "delete_failed";
    notify();
  }
  return !error;
}

/**
 * Copies this browser's investigations into the signed-in account. Items that
 * already exist in the account are skipped. Local copies are kept unless the
 * caller removes them afterwards.
 */
export async function importLocalToAccount(): Promise<{ imported: number; skipped: number; failed: number }> {
  if (backend.kind !== "remote") throw new Error("not_signed_in");
  const local = readLocal();
  const existing = new Set(snapshot().map((i) => i.id));
  const result = { imported: 0, skipped: 0, failed: 0 };
  for (const inv of local) {
    if (existing.has(inv.id)) {
      result.skipped += 1;
      continue;
    }
    if (await saveRemote(backend.client, inv)) {
      result.imported += 1;
      setItems([inv, ...snapshot()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } else {
      result.failed += 1;
    }
  }
  return result;
}
