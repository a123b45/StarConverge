/** Client-side IP rule helpers (mirror server/src/utils/ip-allow.ts). */

export type IpRule = {
  name?: string;
  ip: string;
  action: "ALLOW" | "DENY";
};

export function normalizeIpRules(raw: unknown): IpRule[] {
  if (!Array.isArray(raw)) return [];
  const out: IpRule[] = [];
  for (const item of raw) {
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

export function parseIpRulesImport(jsonText: string): IpRule[] {
  const raw = jsonText.trim();
  if (!raw) return [];
  const data = JSON.parse(raw) as unknown;
  if (Array.isArray(data)) return normalizeIpRules(data);
  if (data && typeof data === "object" && Array.isArray((data as { rules?: unknown }).rules)) {
    return normalizeIpRules((data as { rules: unknown[] }).rules);
  }
  throw new Error("JSON 需包含 rules 数组，或直接为规则数组");
}

export function rulesToImportJson(rules: IpRule[]): string {
  return JSON.stringify(
    {
      rules: rules.map((r) => ({
        name: r.name || "",
        ip: r.ip,
        action: r.action,
      })),
    },
    null,
    2,
  );
}

export function summarizeIpRules(rules: IpRule[]): string {
  if (!rules.length) return "不限";
  const allow = rules.filter((r) => r.action === "ALLOW").length;
  const deny = rules.filter((r) => r.action === "DENY").length;
  if (rules.length <= 2) {
    return rules.map((r) => `${r.action === "DENY" ? "拒" : "允"} ${r.ip}`).join(", ");
  }
  return `${rules.length} 条（允 ${allow} / 拒 ${deny}）`;
}
