import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { recheckInvestigation, runInvestigation } from "@/lib/research/engine";
import type { SearchProvider } from "@/lib/search/types";
import type { Investigation } from "@/types/investigation";
import { FOLK_QUOTE, PRESS_QUOTE, ZOO_QUOTE, fetcher, scriptedAI } from "../fixtures";
import { as, createDatabase, createUser } from "./harness";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const TOKEN = "Abc123_-".repeat(6); // 48 url-safe characters

/** A realistic investigation: evidence, a contradiction, verdicts and one revision. */
async function sampleInvestigation(): Promise<Investigation> {
  const ai = scriptedAI({
    pagesWithEvidence: { "Researchers at the university": [PRESS_QUOTE], "zoology review": [ZOO_QUOTE], "Old folk tales": [FOLK_QUOTE] },
    verdict: { value: "false", explanation: "[1] and [2] contradict [3]." },
    extraClaims: [{ text: "Bats are the cutest animals.", kind: "opinion", verifiable: false }],
  });
  const later: string[] = [];
  const search: SearchProvider = {
    name: "mock",
    async search(query) {
      const urls = query.startsWith("follow-up") ? later : ["https://uni.example.edu/bats", "https://folk.example.org/blind"];
      return urls.map((url) => ({ url, title: url, snippet: "", publisher: new URL(url).hostname, publishedAt: null, provider: "mock", knownType: null }));
    },
  };
  const first = await runInvestigation({ input: "Bats are blind. Bats are the cutest animals.", researchLanguage: "en" }, { ai, search: [search], fetcher });
  later.push("https://zoo.example.org/review");
  return recheckInvestigation(first, { ai, search: [search], fetcher });
}

/** Timestamps come back from Postgres in another (equivalent) format; compare instants. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== "shareToken")
        .map(([k, v]) => [k, ["createdAt", "updatedAt", "accessedAt", "at", "assessedAt"].includes(k) && typeof v === "string" ? new Date(v).getTime() : normalize(v)]),
    );
  }
  return value;
}

const save = (db: PGlite, doc: unknown) => db.query<{ id: string }>("select save_investigation($1::jsonb) as id", [JSON.stringify(doc)]);
const list = async (db: PGlite) => (await db.query<{ docs: Investigation[] }>("select list_my_investigations() as docs")).rows[0].docs;

describe("investigation storage and RLS", () => {
  let db: PGlite;
  let inv: Investigation;

  beforeAll(async () => {
    db = await createDatabase();
    await createUser(db, ALICE, "alice@example.com");
    await createUser(db, BOB, "bob@example.com");
    inv = await sampleInvestigation();
    expect(inv.revisions).toHaveLength(1);
    expect(inv.contradictions.length + inv.verdicts.length).toBeGreaterThan(0);
  }, 60_000);

  it("creates a profile for each new user", async () => {
    const { rows } = await db.query("select id from profiles order by id");
    expect(rows).toHaveLength(2);
  });

  it("round-trips a full investigation without losing or reordering anything", async () => {
    await as(db, ALICE, () => save(db, inv));
    const [loaded] = await as(db, ALICE, () => list(db));
    expect(normalize(loaded)).toEqual(normalize(inv));
    expect(loaded.sources.map((s) => s.url)).toEqual(inv.sources.map((s) => s.url)); // reference numbers stay stable
  });

  it("hides one user's investigations from another", async () => {
    expect(await as(db, BOB, () => list(db))).toEqual([]);
    const direct = await as(db, BOB, () => db.query("select id from investigations union all select investigation_id from claims union all select investigation_id from sources"));
    expect(direct.rows).toEqual([]);
  });

  it("does not let another user overwrite or delete an investigation", async () => {
    await expect(as(db, BOB, () => save(db, { ...inv, input: "Hijacked claim text." }))).rejects.toThrow();
    const removed = await as(db, BOB, () => db.query("delete from investigations where id = $1", [inv.id]));
    expect(removed.affectedRows).toBe(0);
    const [still] = await as(db, ALICE, () => list(db));
    expect(still.input).toBe(inv.input);
  });

  it("refuses anonymous saving and listing", async () => {
    await expect(as(db, null, () => save(db, inv))).rejects.toThrow(/permission denied/);
    await expect(as(db, null, () => list(db))).rejects.toThrow(/permission denied/);
  });

  it("replaces the research record on re-save but never rewrites revisions", async () => {
    const edited = structuredClone(inv);
    edited.favorite = true;
    edited.revisions[0].changed = !inv.revisions[0].changed; // attempt to rewrite history
    await as(db, ALICE, () => save(db, edited));
    const [loaded] = await as(db, ALICE, () => list(db));
    expect(loaded.favorite).toBe(true);
    expect(loaded.revisions[0].changed).toBe(inv.revisions[0].changed);
    const counts = await db.query<{ n: number }>("select count(*)::int as n from claims where investigation_id = $1", [inv.id]);
    expect(counts.rows[0].n).toBe(inv.claims.length); // no duplicates after re-save
  });

  it("keeps revisions append-only even for the owner", async () => {
    const updated = await as(db, ALICE, () => db.query("update report_revisions set changed = not changed where investigation_id = $1", [inv.id]));
    const deleted = await as(db, ALICE, () => db.query("delete from report_revisions where investigation_id = $1", [inv.id]));
    expect(updated.affectedRows).toBe(0);
    expect(deleted.affectedRows).toBe(0);
  });

  it("rejects oversized documents", async () => {
    const huge = { ...structuredClone(inv), id: crypto.randomUUID(), events: Array.from({ length: 101 }, () => inv.events[0]) };
    await expect(as(db, ALICE, () => save(db, huge))).rejects.toThrow(/document_too_large/);
  });
});

describe("sharing by link", () => {
  let db: PGlite;
  let inv: Investigation;
  const shared = (token: string) => db.query<{ doc: Record<string, unknown> | null }>("select get_shared_report($1) as doc", [token]);

  beforeAll(async () => {
    db = await createDatabase();
    await createUser(db, ALICE, "alice@example.com");
    await createUser(db, BOB, "bob@example.com");
    inv = await sampleInvestigation();
    await as(db, ALICE, () => save(db, inv));
  }, 60_000);

  it("is private by default", async () => {
    expect((await as(db, null, () => shared(TOKEN))).rows[0].doc).toBeNull();
    expect((await as(db, null, () => db.query("select * from investigations"))).rows).toEqual([]);
  });

  it("shows the report to anyone with the link, without private fields", async () => {
    await as(db, ALICE, () => db.query("update investigations set visibility = 'link', share_token = $2 where id = $1", [inv.id, TOKEN]));
    const doc = (await as(db, null, () => shared(TOKEN))).rows[0].doc!;
    expect(doc.id).toBe(inv.id);
    expect(doc).not.toHaveProperty("shareToken");
    expect(doc).not.toHaveProperty("user_id");
    expect(JSON.stringify(doc)).not.toContain(ALICE);
    expect((await as(db, null, () => shared(`${TOKEN.slice(0, -1)}x`))).rows[0].doc).toBeNull();
    // The token never exposes other tables to anonymous users.
    expect((await as(db, null, () => db.query("select * from claims"))).rows).toEqual([]);
  });

  it("rejects weak tokens and inconsistent sharing state", async () => {
    await expect(as(db, ALICE, () => db.query("update investigations set share_token = 'short' where id = $1", [inv.id]))).rejects.toThrow(/share_token_strength/);
    await expect(as(db, ALICE, () => db.query("update investigations set visibility = 'private' where id = $1", [inv.id]))).rejects.toThrow(/share_token_matches_visibility/);
  });

  it("does not let another user enable sharing", async () => {
    const r = await as(db, BOB, () => db.query("update investigations set visibility = 'link', share_token = $2 where id = $1", [inv.id, `${TOKEN}zz`]));
    expect(r.affectedRows).toBe(0);
  });

  it("stops working as soon as the owner revokes it", async () => {
    await as(db, ALICE, () => db.query("update investigations set visibility = 'private', share_token = null where id = $1", [inv.id]));
    expect((await as(db, null, () => shared(TOKEN))).rows[0].doc).toBeNull();
  });
});

describe("notes and collections", () => {
  let db: PGlite;
  let aliceInv: Investigation;
  let bobInv: Investigation;

  beforeAll(async () => {
    db = await createDatabase();
    await createUser(db, ALICE, "alice@example.com");
    await createUser(db, BOB, "bob@example.com");
    aliceInv = await sampleInvestigation();
    bobInv = await sampleInvestigation();
    await as(db, ALICE, () => save(db, aliceInv));
    await as(db, BOB, () => save(db, bobInv));
  }, 60_000);

  it("lets owners write notes on their own investigations only", async () => {
    await as(db, ALICE, () => db.query("insert into user_notes (user_id, investigation_id, body) values ($1, $2, 'Check the 2019 survey.')", [ALICE, aliceInv.id]));
    await expect(as(db, BOB, () => db.query("insert into user_notes (user_id, investigation_id, body) values ($1, $2, 'sneaky')", [BOB, aliceInv.id]))).rejects.toThrow(/row-level security/);
    await expect(as(db, ALICE, () => db.query("insert into user_notes (user_id, investigation_id, body) values ($1, $2, '   ')", [ALICE, aliceInv.id]))).rejects.toThrow(/user_notes_body_not_blank/);
    expect((await as(db, BOB, () => db.query("select * from user_notes"))).rows).toEqual([]);
    expect((await as(db, ALICE, () => db.query("select body from user_notes"))).rows).toEqual([{ body: "Check the 2019 survey." }]);
  });

  it("does not include notes in shared reports", async () => {
    await as(db, ALICE, () => db.query("update investigations set visibility = 'link', share_token = $2 where id = $1", [aliceInv.id, TOKEN]));
    const doc = (await as(db, null, () => db.query<{ doc: unknown }>("select get_shared_report($1) as doc", [TOKEN]))).rows[0].doc;
    expect(JSON.stringify(doc)).not.toContain("2019 survey");
  });

  it("lets owners collect only their own investigations", async () => {
    const { rows } = await as(db, ALICE, () => db.query<{ id: string }>("insert into collections (user_id, name) values ($1, 'Health myths') returning id", [ALICE]));
    const collection = rows[0].id;
    await as(db, ALICE, () => db.query("insert into collection_items (collection_id, investigation_id) values ($1, $2)", [collection, aliceInv.id]));
    await expect(as(db, ALICE, () => db.query("insert into collection_items (collection_id, investigation_id) values ($1, $2)", [collection, bobInv.id]))).rejects.toThrow(/row-level security/);
    await expect(as(db, BOB, () => db.query("insert into collection_items (collection_id, investigation_id) values ($1, $2)", [collection, bobInv.id]))).rejects.toThrow(/row-level security/);
    expect((await as(db, BOB, () => db.query("select * from collections"))).rows).toEqual([]);
  });

  it("removes everything belonging to an investigation when its owner deletes it", async () => {
    await as(db, ALICE, () => db.query("delete from investigations where id = $1", [aliceInv.id]));
    for (const table of ["claims", "sources", "evidence", "verdicts", "report_revisions", "user_notes", "collection_items"]) {
      const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from ${table} where investigation_id = $1`, [aliceInv.id]);
      expect(rows[0].n, table).toBe(0);
    }
  });
});
