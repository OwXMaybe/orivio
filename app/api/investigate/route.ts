import { NextResponse } from "next/server";
import { createAIProvider } from "@/lib/ai";
import { getServerConfig } from "@/lib/config/env";
import { runInvestigation } from "@/lib/research/engine";
import { createSearchProviders } from "@/lib/search";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin, readJsonBody } from "@/lib/security/request";
import { investigateRequestSchema } from "@/lib/validation/investigate";
import type { EngineMessage } from "@/types/investigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Upper bound for one investigation, including retries and an additional round (seconds). */
export const maxDuration = 300;

/** Excerpts are kept short in the response so browser-side storage stays small. */
const CLIENT_EXCERPT_CHARS = 1500;
const MAX_BODY_BYTES = 32 * 1024;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const limit = rateLimit(`investigate:${clientKey(request)}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = investigateRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid_request" }, { status: 400 });
  }

  const config = getServerConfig();
  const deps = { ai: createAIProvider(config.ai), search: createSearchProviders(config.search) };
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: EngineMessage) => controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      try {
        const investigation = await runInvestigation(parsed.data, deps, (event) => send({ type: "event", event }));
        investigation.sources = investigation.sources.map((s) => ({
          ...s,
          excerpt: s.excerpt ? s.excerpt.slice(0, CLIENT_EXCERPT_CHARS) : null,
        }));
        send({ type: "result", investigation });
      } catch (error) {
        console.error("investigation failed", error);
        send({ type: "error", error: "engine_failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
