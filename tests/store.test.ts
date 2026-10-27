import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import type { Investigation } from "@/types/investigation";

// The store reads localStorage; give it a minimal browser-like global.
const memory = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
      removeItem: (k: string) => void memory.delete(k),
    },
    addEventListener() {},
    removeEventListener() {},
  },
});

const store = await import("@/lib/database/investigations-store");

function inv(id: string, createdAt = "2026-10-01T00:00:00.000Z"): Investigation {
  return {
    id, input: `Claim ${id}`, inputUrl: null, researchLanguage: "en", createdAt, updatedAt: createdAt, status: "partial",
    mode: { ai: "heuristic", search: null }, claims: [], queries: [], sources: [], evidence: [], contradictions: [], rounds: 0,
    verdicts: [], revisions: [], events: [], limitations: [], primaryCategory: "other", favorite: false,
  };
}

type Call = { kind: string; name: string; args?: unknown };

/** Just enough of SupabaseClient for the store: rpc() and from().update/delete chains. */
function fakeClient(opts: { remote?: Investigation[]; updateRows?: number; failDelete?: boolean; failSave?: boolean } = {}) {
  const calls: Call[] = [];
  const client = {
    rpc: async (name: string, args?: unknown) => {
      calls.push({ kind: "rpc", name, args });
      if (name === "list_my_investigations") return { data: opts.remote ?? [], error: null };
      if (name === "save_investigation") return opts.failSave ? { data: null, error: { message: "denied" } } : { data: "ok", error: null };
      return { data: null, error: { message: "unknown" } };
    },
    from: (table: string) => ({
      update: (row: unknown) => ({
        eq: () => ({
          select: async () => {
            calls.push({ kind: "update", name: table, args: row });
            return { data: Array.from({ length: opts.updateRows ?? 1 }, () => ({ id: "x" })), error: null };
          },
        }),
      }),
      delete: () => ({
        eq: async () => {
          calls.push({ kind: "delete", name: table });
          return { error: opts.failDelete ? { message: "denied" } : null };
        },
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const items = () => store.readLocal();

describe("investigations store", () => {
  beforeEach(async () => {
    memory.clear();
    await store.switchBackend({ kind: "local" });
  });

  it("persists locally while signed out", async () => {
    expect(await store.saveInvestigation(inv("a"))).toBe(true);
    expect(items().map((i) => i.id)).toEqual(["a"]);
  });

  it("loads the account's investigations after sign-in and never writes them to localStorage", async () => {
    const { client, calls } = fakeClient({ remote: [inv("r1")] });
    await store.switchBackend({ kind: "remote", client, userId: "u1" });
    expect(calls.map((c) => c.name)).toEqual(["list_my_investigations"]);
    await store.saveInvestigation({ ...inv("r2"), shareToken: "should-not-be-sent" });
    const save = calls.find((c) => c.name === "save_investigation")!;
    expect((save.args as { doc: Investigation }).doc).not.toHaveProperty("shareToken");
    expect(items()).toEqual([]);
  });

  it("reverts an update that changed no row and reports failure", async () => {
    const { client } = fakeClient({ remote: [inv("r1")], updateRows: 0 });
    await store.switchBackend({ kind: "remote", client, userId: "u1" });
    const ok = await store.updateInvestigation("r1", { shareToken: "x".repeat(43) });
    expect(ok).toBe(false);
    expect(store.currentInvestigations()[0].shareToken ?? null).toBeNull();
  });

  it("maps sharing to visibility and token columns", async () => {
    const { client, calls } = fakeClient({ remote: [inv("r1")] });
    await store.switchBackend({ kind: "remote", client, userId: "u1" });
    await store.updateInvestigation("r1", { shareToken: "t".repeat(43) });
    await store.updateInvestigation("r1", { shareToken: null });
    expect(calls.filter((c) => c.kind === "update").map((c) => c.args)).toEqual([
      { share_token: "t".repeat(43), visibility: "link" },
      { share_token: null, visibility: "private" },
    ]);
  });

  it("restores an item when a remote delete fails", async () => {
    const { client } = fakeClient({ remote: [inv("r1")], failDelete: true });
    await store.switchBackend({ kind: "remote", client, userId: "u1" });
    expect(await store.deleteInvestigation("r1")).toBe(false);
    expect(store.currentInvestigations().map((i) => i.id)).toEqual(["r1"]);
  });

  it("imports local investigations into the account, skipping ones already there", async () => {
    await store.saveInvestigation(inv("a", "2026-10-02T00:00:00.000Z"));
    await store.saveInvestigation(inv("shared", "2026-10-01T00:00:00.000Z"));
    const { client, calls } = fakeClient({ remote: [inv("shared")] });
    await store.switchBackend({ kind: "remote", client, userId: "u1" });
    expect(await store.importLocalToAccount()).toEqual({ imported: 1, skipped: 1, failed: 0 });
    expect(calls.filter((c) => c.name === "save_investigation")).toHaveLength(1);
    expect(items().map((i) => i.id).sort()).toEqual(["a", "shared"]); // local copies are kept
  });

  it("counts failed imports", async () => {
    await store.saveInvestigation(inv("a"));
    const { client } = fakeClient({ remote: [], failSave: true });
    await store.switchBackend({ kind: "remote", client, userId: "u1" });
    expect(await store.importLocalToAccount()).toEqual({ imported: 0, skipped: 0, failed: 1 });
  });

  it("refuses to import while signed out", async () => {
    await expect(store.importLocalToAccount()).rejects.toThrow("not_signed_in");
  });
});
