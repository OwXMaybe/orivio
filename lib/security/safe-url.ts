import { isIP } from "node:net";
import { isBlockedIp } from "./ip";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa"];

/**
 * Static checks that need no DNS: scheme, credentials, port, and obviously
 * internal hostnames. DNS-level checks happen at connect time in safeFetch.
 */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UnsafeUrlError("Non-standard ports are not allowed.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) throw new UnsafeUrlError("URL has no host.");
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("Local and internal hosts are not allowed.");
  }
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new UnsafeUrlError("Private or reserved IP addresses are not allowed.");
  } else if (!host.includes(".")) {
    throw new UnsafeUrlError("Single-label hostnames are not allowed.");
  } else if (/^[0-9.]+$/.test(host) || /^0x/i.test(host)) {
    // Shorthand/hex IPv4 forms that URL parsing did not normalize.
    throw new UnsafeUrlError("Ambiguous numeric hostnames are not allowed.");
  }
  return url;
}

const URL_ONLY = /^\s*(https?:\/\/\S+)\s*$/i;

/** Returns the URL when the whole input is a single http(s) URL. */
export function detectUrlInput(input: string): string | null {
  const match = URL_ONLY.exec(input);
  return match ? match[1] : null;
}
