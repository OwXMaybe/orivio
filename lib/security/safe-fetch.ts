import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isBlockedIp } from "./ip";
import { assertSafeUrl, UnsafeUrlError } from "./safe-url";

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
};

export type SafeFetchResult = {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
};

/**
 * DNS lookup that refuses to connect to non-public addresses. Validating at
 * connect time (instead of a separate pre-check) closes the DNS-rebinding gap.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as unknown as LookupAddress[];
    const blocked = list.find((a) => isBlockedIp(a.address));
    if (!list.length || blocked) {
      return callback(new UnsafeUrlError("Host resolves to a private or reserved address."), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

function requestOnce(url: URL, opts: Required<SafeFetchOptions>): Promise<SafeFetchResult & { location?: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: opts.timeoutMs,
        headers: {
          "User-Agent": "ORIVIO-Research/0.1 (+evidence verification)",
          Accept: opts.accept,
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ finalUrl: url.toString(), status, contentType, body: "", truncated: false, location: res.headers.location });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          if (size > opts.maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (size - opts.maxBytes)));
            res.destroy();
            return resolve({ finalUrl: url.toString(), status, contentType, body: Buffer.concat(chunks).toString("utf8"), truncated });
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ finalUrl: url.toString(), status, contentType, body: Buffer.concat(chunks).toString("utf8"), truncated }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out.")));
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetches an external URL treating it as hostile: static URL checks, DNS
 * checks at connect time, every redirect re-validated, size and time limits.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts: Required<SafeFetchOptions> = {
    timeoutMs: options.timeoutMs ?? 8000,
    maxBytes: options.maxBytes ?? 1_500_000,
    maxRedirects: options.maxRedirects ?? 3,
    accept: options.accept ?? "text/html,application/xhtml+xml,text/plain;q=0.9",
  };
  let url = assertSafeUrl(rawUrl);
  for (let hop = 0; hop <= opts.maxRedirects; hop++) {
    const result = await requestOnce(url, opts);
    if (!result.location) return result;
    url = assertSafeUrl(new URL(result.location, url).toString());
  }
  throw new UnsafeUrlError("Too many redirects.");
}
