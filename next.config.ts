import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/security/csp";

const securityHeaders = Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value }));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      // Pages also get a nonce-based CSP from middleware.ts.
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }, { key: "Cache-Control", value: "no-store" }],
      },
      {
        // The service worker must always be revalidated so updates reach users.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }],
      },
      ...(process.env.NODE_ENV === "production"
        ? [{ source: "/:path*", headers: [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] }]
        : []),
    ];
  },
};

export default nextConfig;
