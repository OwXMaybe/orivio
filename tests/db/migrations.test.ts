import { describe, expect, it } from "vitest";
import { createDatabase } from "./harness";

describe("migrations", () => {
  it("apply cleanly on a fresh database", async () => {
    const db = await createDatabase();
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
    expect(rows[0].n).toBeGreaterThanOrEqual(13);
  }, 60_000);
});
