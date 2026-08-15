/** Very small IPv4 helpers for token IP allowlists (exact or /8-/32 CIDR). */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function matchCidr(ip: string, rule: string): boolean {
  const trimmed = rule.trim();
  if (!trimmed) return false;
  if (trimmed === "*" || trimmed === "0.0.0.0/0") return true;
  if (!trimmed.includes("/")) {
    return ip === trimmed;
  }
  const [base, bitsRaw] = trimmed.split("/");
  const bits = Number(bitsRaw);
  if (!base || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipv4ToInt(ip);
  const baseN = ipv4ToInt(base);
  if (ipN == null || baseN == null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

export function isIpAllowed(clientIp: string | undefined | null, allowlist: string[]): boolean {
  if (!allowlist.length) return true;
  if (!clientIp) return false;
  const ip = clientIp.split(",")[0]?.trim() ?? "";
  if (!ip) return false;
  // strip ipv6-mapped ipv4
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return allowlist.some((rule) => matchCidr(normalized, rule));
}
