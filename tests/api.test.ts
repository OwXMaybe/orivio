import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as investigate } from "@/app/api/investigate/route";
import { POST as recheck } from "@/app/api/investigate/recheck/route";
import { GET as status } from "@/app/api/status/route";
import { investigationSchema } from "@/lib/validation/investigation";
import type { EngineMessage, Investigation } from "@/types/investigation";

const ENV_KEYS = ["AI_API_KEY", "ANTHROPIC_API_KEY", "SEARCH_API_KEY", "GOOGLE_FACT_CHECK_API_KEY", "ORIVIO_DEMO_MODE", "AI_PROVIDER"];
let savedEnv: Record<string, string | undefined>;
let ip = 0;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Each request gets its own client IP unless one is given, so rate limits don't leak between tests. */
function request(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", "x-forwarded-for": `10.0.0.${++ip}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readStream(response: Response): Promise<EngineMessage[]> {
  const text = await response.text();
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as EngineMessage);
}

describe("POST /api/investigate", () => {
  it("streams real stage events and a valid investigation", async () => {
    const response = await investigate(request("/api/investigate", { input: "Bats are blind. I think bats are cute.", researchLanguage: "en" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const messages = await readStream(response);
    const events = messages.filter((m) => m.type === "event");
    const result = messages.find((m) => m.type === "result");
    expect(events.map((e) => e.type === "event" && e.event.stage)).toEqual([
      "claim_received", "claims_extracted", "research_plan_created", "sources_discovered", "evidence_analyzed", "sources_compared", "report_generated",
    ]);
    expect(result?.type).toBe("result");
    const inv = (result as { investigation: Investigation }).investigation;
    expect(investigationSchema.safeParse(inv).success).toBe(true);
    expect(inv.verdicts).toEqual([]); // no AI: no verdict is invented
    expect(inv.limitations).toEqual(expect.arrayContaining(["no_ai_provider", "no_search_provider"]));
  });

  it.each([
    ["malformed JSON", "{not json", {}, 400, "invalid_request"],
    ["wrong content type", JSON.stringify({ input: "Bats are blind." }), { "content-type": "text/plain" }, 415, "unsupported_media_type"],
    ["too short input", { input: "hi" }, {}, 400, "input_too_short"],
    ["too long input", { input: "x".repeat(4001) }, {}, 400, "input_too_long"],
    ["unknown language", { input: "Bats are blind.", researchLanguage: "de" }, {}, 400, undefined],
  ] as const)("rejects %s", async (_label, body, headers, code, error) => {
    const response = await investigate(request("/api/investigate", body, headers));
    expect(response.status).toBe(code);
    if (error) expect(await response.json()).toEqual({ error });
  });

  it("rejects oversized bodies, declared or streamed", async () => {
    const big = JSON.stringify({ input: "a".repeat(40_000) });
    expect((await investigate(request("/api/investigate", big))).status).toBe(413);
    const streamed = new Request("http://localhost:3000/api/investigate", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3000", "x-forwarded-for": "10.9.9.9" },
      body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } }),
      duplex: "half",
    } as RequestInit);
    expect((await investigate(streamed)).status).toBe(413);
  });

  it("blocks requests from other sites", async () => {
    const response = await investigate(request("/api/investigate", { input: "Bats are blind." }, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    const ok = await investigate(request("/api/investigate", { input: "Bats are blind." }, { origin: "http://localhost:3000" }));
    expect(ok.status).toBe(200);
  });

  it("rate-limits a single client", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await investigate(request("/api/investigate", { input: "Bats are blind." }, { "x-forwarded-for": "203.0.113.50" }));
      statuses.push(r.status);
      await r.text();
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("refuses internal URLs without making a request", async () => {
    for (const url of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:3000/api/status", "http://localhost/admin"]) {
      const messages = await readStream(await investigate(request("/api/investigate", { input: url })));
      const inv = (messages.find((m) => m.type === "result") as { investigation: Investigation }).investigation;
      expect(inv.status).toBe("failed");
      expect(inv.limitations).toContain("url_input_failed");
      expect(inv.claims).toEqual([]);
    }
  });
});

describe("GET /api/status", () => {
  it("reports provider names but never secrets", async () => {
    process.env.AI_API_KEY = "sk-ant-SECRET-123";
    process.env.SEARCH_API_KEY = "BSA-SECRET-456";
    process.env.GOOGLE_FACT_CHECK_API_KEY = "AIza-SECRET-789";
    const text = await (await status()).text();
    expect(JSON.parse(text)).toMatchObject({ ai: { provider: "anthropic" }, search: ["brave", "google_fact_check"] });
    expect(text).not.toMatch(/SECRET/);
  });

  it("disables every provider in demo mode", async () => {
    process.env.AI_API_KEY = "sk-ant-SECRET-123";
    process.env.SEARCH_API_KEY = "BSA-SECRET-456";
    process.env.ORIVIO_DEMO_MODE = "true";
    expect(await (await status()).json()).toMatchObject({ demoMode: true, ai: null, search: [] });
  });
});

describe("POST /api/investigate/recheck", () => {
  async function storedInvestigation(): Promise<Investigation> {
    const messages = await readStream(await investigate(request("/api/investigate", { input: "Bats are blind.", researchLanguage: "en" })));
    return (messages.find((m) => m.type === "result") as { investigation: Investigation }).investigation;
  }

  it("needs providers", async () => {
    const response = await recheck(request("/api/investigate/recheck", { investigation: await storedInvestigation() }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "providers_required" });
  });

  it("rejects tampered or malformed investigations", async () => {
    const inv = await storedInvestigation();
    const tampered = { ...inv, sources: [{ ...((inv.sources[0] ?? {}) as object), url: "file:///etc/passwd" }] };
    expect((await recheck(request("/api/investigate/recheck", { investigation: tampered }))).status).toBe(400);
    expect((await recheck(request("/api/investigate/recheck", { investigation: { id: "x" } }))).status).toBe(400);
  });

  it("blocks other sites", async () => {
    const response = await recheck(request("/api/investigate/recheck", { investigation: await storedInvestigation() }, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
  });
});
