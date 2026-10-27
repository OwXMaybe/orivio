/** Guards shared by the POST API routes. */

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: number; error: string };

/**
 * Rejects browser requests coming from another site. Requests without an
 * Origin header (curl, server-to-server) are allowed; they carry no user session.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Reads a JSON body without ever buffering more than `maxBytes`. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<BodyResult> {
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) {
    return { ok: false, status: 415, error: "unsupported_media_type" };
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, status: 413, error: "payload_too_large" };
  if (!request.body) return { ok: false, status: 400, error: "invalid_request" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413, error: "payload_too_large" };
    }
    chunks.push(value);
  }
  try {
    const text = new TextDecoder().decode(concat(chunks, size));
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  }
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
