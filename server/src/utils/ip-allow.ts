/** IPv4 allow/deny rules for API tokens (exact IP or CIDR /0-/32). */

export type IpRule = {
  name?: string;
  ip: string;
  action: "ALLOW" | "DENY";
};

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

export function matchCidr(ip: string, rule: string): boolean {
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

function normalizeIp(clientIp: string): string {
  const ip = clientIp.split(",")[0]?.trim() ?? "";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/** Accept legacy string[] or {name,ip,action}[] stored in ip_allowlist JSON. */
export function parseIpRules(raw: string | null | undefined | unknown[]): IpRule[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: IpRule[] = [];
  for (const item of parsed) {
    if (typeof item === "string") {
      const ip = item.trim();
      if (ip) out.push({ name: "", ip, action: "ALLOW" });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const ip = String(obj.ip ?? obj.cidr ?? "").trim();
    if (!ip) continue;
    const actionRaw = String(obj.action ?? "ALLOW").toUpperCase();
    out.push({
      name: String(obj.name ?? "").trim(),
      ip,
      action: actionRaw === "DENY" || actionRaw === "BLOCK" ? "DENY" : "ALLOW",
    });
  }
  return out;
}

export function serializeIpRules(rules: IpRule[]): string {
  return JSON.stringify(
    rules.map((r) => ({
      name: (r.name ?? "").trim(),
      ip: r.ip.trim(),
      action: r.action === "DENY" ? "DENY" : "ALLOW",
    })),
  );
}

/**
 * Empty rules → allow all.
 * Any matching DENY → reject.
 * If any ALLOW exists → must match at least one ALLOW.
 * Only DENY rules → allow unless denied.
 */
export function isIpAllowed(
  clientIp: string | undefined | null,
  rulesOrAllowlist: IpRule[] | string[],
): boolean {
  const rules: IpRule[] = Array.isArray(rulesOrAllowlist)
    ? rulesOrAllowlist.length && typeof rulesOrAllowlist[0] === "string"
      ? (rulesOrAllowlist as string[]).map((ip) => ({
          ip,
          action: "ALLOW" as const,
        }))
      : (rulesOrAllowlist as IpRule[])
    : [];
  if (!rules.length) return true;
  if (!clientIp) return false;
  const ip = normalizeIp(clientIp);
  if (!ip) return false;

  for (const rule of rules) {
    if (rule.action === "DENY" && matchCidr(ip, rule.ip)) return false;
  }
  const allows = rules.filter((r) => r.action === "ALLOW");
  if (!allows.length) return true;
  return allows.some((r) => matchCidr(ip, r.ip));
}

export function parseIpRulesImport(jsonText: string): IpRule[] {
  const raw = jsonText.trim();
  if (!raw) return [];
  const data = JSON.parse(raw) as unknown;
  if (Array.isArray(data)) return parseIpRules(data);
  if (data && typeof data === "object" && Array.isArray((data as { rules?: unknown }).rules)) {
    return parseIpRules((data as { rules: unknown[] }).rules);
  }
  throw new Error("JSON 需包含 rules 数组，或直接为规则数组");
}
