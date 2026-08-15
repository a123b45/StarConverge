import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

/** Strip IPv6-mapped IPv4 and take first hop from CSV lists. */
export function normalizeClientIp(raw: string): string {
  const ip = raw.split(",")[0]?.trim() ?? "";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/**
 * Prefer proxy headers, then fall back to the TCP peer address.
 * Direct browser hits (no reverse proxy) only have the socket IP.
 */
export function getRequestClientIp(c: Context): string | undefined {
  const forwarded =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip")?.trim() ||
    c.req.header("cf-connecting-ip")?.trim();
  if (forwarded) return normalizeClientIp(forwarded);

  try {
    const addr = getConnInfo(c).remote.address;
    if (addr) return normalizeClientIp(addr);
  } catch {
    /* non-Node adapters or missing bindings */
  }
  return undefined;
}
