import { isIP } from "node:net";

type V4Range = [base: number, maskBits: number];

// Every range that is not publicly routable or that targets the host itself.
const BLOCKED_V4: V4Range[] = [
  [ipv4ToInt("0.0.0.0"), 8],
  [ipv4ToInt("10.0.0.0"), 8],
  [ipv4ToInt("100.64.0.0"), 10],
  [ipv4ToInt("127.0.0.0"), 8],
  [ipv4ToInt("169.254.0.0"), 16],
  [ipv4ToInt("172.16.0.0"), 12],
  [ipv4ToInt("192.0.0.0"), 24],
  [ipv4ToInt("192.0.2.0"), 24],
  [ipv4ToInt("192.88.99.0"), 24],
  [ipv4ToInt("192.168.0.0"), 16],
  [ipv4ToInt("198.18.0.0"), 15],
  [ipv4ToInt("198.51.100.0"), 24],
  [ipv4ToInt("203.0.113.0"), 24],
  [ipv4ToInt("224.0.0.0"), 4],
  [ipv4ToInt("240.0.0.0"), 4],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

/** Expands an IPv6 address into eight 16-bit groups. Returns null if malformed. */
function expandV6(ip: string): number[] | null {
  let address = ip.toLowerCase();
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);

  // Rewrite an embedded IPv4 tail (::ffff:127.0.0.1) as two hex groups.
  const lastColon = address.lastIndexOf(":");
  const maybeV4 = address.slice(lastColon + 1);
  if (isIP(maybeV4) === 4) {
    const v = ipv4ToInt(maybeV4);
    address = `${address.slice(0, lastColon + 1)}${(v >>> 16).toString(16)}:${(v & 0xffff).toString(16)}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 1) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  }
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function isBlockedV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return true;
  const allZeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);

  if (g.every((x) => x === 0)) return true; // ::
  if (allZeroPrefix(7) && g[7] === 1) return true; // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard

  const embedded = (hi: number, lo: number) =>
    `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), NAT64 (64:ff9b::a.b.c.d)
  if (allZeroPrefix(5) && g[5] === 0xffff) return isBlockedV4(embedded(g[6], g[7]));
  if (allZeroPrefix(6)) return isBlockedV4(embedded(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isBlockedV4(embedded(g[6], g[7]));
  }
  // 6to4 (2002:AABB:CCDD::) embeds an IPv4 address in groups 1-2.
  if (g[0] === 0x2002) return isBlockedV4(embedded(g[1], g[2]));
  return false;
}

/** True when an IP literal points at loopback, private, link-local or otherwise non-public space. */
export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedV4(ip);
  if (version === 6) return isBlockedV6(ip);
  return true;
}
