/**
 * Content Security Policy for every page. Scripts run only with the per-request
 * nonce ('strict-dynamic' lets those scripts load Next.js chunks); the browser may
 * talk only to this origin and, when configured, the Supabase project.
 */
export function buildCsp(nonce: string, opts: { dev: boolean; supabaseUrl?: string | null }): string {
  const connect = ["'self'"];
  if (opts.supabaseUrl) {
    try {
      const origin = new URL(opts.supabaseUrl).origin;
      connect.push(origin, origin.replace(/^http/, "ws"));
    } catch {
      // Malformed URL: leave Supabase out rather than widening the policy.
    }
  }
  if (opts.dev) connect.push("ws:"); // hot reload

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes are used for computed widths in charts; no inline <style> injection from data.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": connect,
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(opts.dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

/** Headers applied to every response (pages and API). */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
