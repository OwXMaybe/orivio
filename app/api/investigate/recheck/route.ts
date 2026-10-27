import { NextResponse } from "next/server";
import { createAIProvider } from "@/lib/ai";
import { getServerConfig } from "@/lib/config/env";
import { RecheckError, recheckInvestigation } from "@/lib/research/engine";
import { createSearchProviders } from "@/lib/search";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin, readJsonBody } from "@/lib/security/request";
import { recheckRequestSchema } from "@/lib/validation/investigation";
import type { EngineMessage, Investigation } from "@/types/investigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CLIENT_EXCERPT_CHARS = 1500;
/** A stored investigation with 150 sources of 1,500-char excerpts stays well under this. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Re-runs research for a stored investigation and returns it with a new revision. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const limit = rateLimit(`recheck:${clientKey(request)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  }

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = recheckRequestSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const config = getServerConfig();
  const deps = { ai: createAIProvider(config.ai), search: createSearchProviders(config.search) };
  if (!deps.ai || !deps.search.length) return NextResponse.json({ error: "providers_required" }, { status: 409 });
  const previous = parsed.data.investigation as Investigation;
  if (previous.status === "failed") return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: EngineMessage) => controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      try {
        const investigation = await recheckInvestigation(previous, deps, (event) => send({ type: "event", event }));
        investigation.sources = investigation.sources.map((s) => ({ ...s, excerpt: s.excerpt ? s.excerpt.slice(0, CLIENT_EXCERPT_CHARS) : null }));
        send({ type: "result", investigation });
      } catch (error) {
        if (error instanceof RecheckError) {
          send({ type: "error", error: error.code });
        } else {
          console.error("recheck failed", error);
          send({ type: "error", error: "engine_failed" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
