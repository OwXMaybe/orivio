import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, generateNonce, SECURITY_HEADERS } from "@/lib/security/csp";

/**
 * Issues a fresh CSP nonce per page request. Next.js reads the nonce from the
 * request's CSP header and adds it to its own scripts; the layout uses it for
 * the theme boot script.
 */
export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV !== "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

export const config = {
  // Pages only: API routes get headers from next.config; static assets need no nonce.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|icon.svg|icons/|manifest.webmanifest|sw.js|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
