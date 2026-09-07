import { detectModelFamily } from "./model-taxonomy";
import { estimateCostUsd, type PriceQuote } from "./portal-models";

export type OfficialVendor =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "qwen";

export type OfficialQuote = PriceQuote & {
  id: string;
  vendor: OfficialVendor;
  vendorLabel?: string;
  model: string;
};

export const OFFICIAL_VENDORS: Array<{ id: OfficialVendor; label: string }> = [
  { id: "openai", label: "OpenAI 官方" },
  { id: "anthropic", label: "Anthropic 官方" },
  { id: "google", label: "Google 官方" },
  { id: "deepseek", label: "DeepSeek 官方" },
  { id: "qwen", label: "通义官方" },
];

export function vendorLabel(id: OfficialVendor, fallback?: string): string {
  return fallback || OFFICIAL_VENDORS.find((v) => v.id === id)?.label || id;
}

/** Align with server `normalizeModelId` — compare on the leaf id, not the vendor prefix. */
export function normalizeModelId(raw: string): string {
  let n = raw.trim().toLowerCase();
  if (!n) return "";
  if (n.includes("/")) n = n.slice(n.lastIndexOf("/") + 1);
  n = n.replace(/^(us|eu|global|au|apac)\./, "");
  n = n.replace(/^(anthropic|openai|google|gemini|amazon)\./, "");
  n = n.replace(/_/g, "-");
  n = n.replace(/@\d{8}$/, "");
  n = n.replace(/-v\d+:\d+$/, "");
  n = n.replace(/:\d+$/, "");
  return n;
}

/** `claude-haiku-4-5-20251001` → `claude-haiku-4-5`. */
export function stripDatedSuffix(id: string): string {
  return id
    .replace(/-\d{8}(?:-v\d+)?$/, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-v\d+$/, "");
}

function modelKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const n = normalizeModelId(raw);
  if (!n) return [];
  const s = stripDatedSuffix(n);
  return s && s !== n ? [n, s] : [n];
}

/**
 * Official quotes for the same model id only.
 * DeepSeek 官方没有 Claude，就不会出现在对照渠道里。
 */
export function quotesForSameModel(
  catalog: OfficialQuote[],
  model: string,
  extra: Array<string | null | undefined> = [],
): OfficialQuote[] {
  const keys = new Set([...modelKeys(model), ...extra.flatMap(modelKeys)]);
  if (!keys.size) return [];
  const hits: OfficialQuote[] = [];
  const seen = new Set<string>();
  for (const q of catalog) {
    const qKeys = [...modelKeys(q.id), ...modelKeys(q.model)];
    if (!qKeys.some((k) => keys.has(k))) continue;
    const sig = `${q.vendor}:${q.id}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    hits.push(q);
  }
  return hits;
}

export function defaultVendorForModel(model: string): OfficialVendor {
  const family = detectModelFamily(model);
  if (family === "gpt") return "openai";
  if (family === "claude") return "anthropic";
  if (family === "gemini") return "google";
  if (family === "deepseek") return "deepseek";
  if (family === "qwen") return "qwen";
  return "openai";
}

export type PriceCompare = {
  ours: number;
  official: number;
  saved: number;
  pct: number;
  cheaper: boolean;
};

export function compareCost(
  ours: PriceQuote,
  official: PriceQuote,
  promptTokens: number,
  completionTokens: number,
  cacheTokens = 0,
): PriceCompare {
  const a = estimateCostUsd(ours, promptTokens, completionTokens, cacheTokens);
  const b = estimateCostUsd(official, promptTokens, completionTokens, cacheTokens);
  const saved = b - a;
  const pct = b > 0 ? saved / b : 0;
  return { ours: a, official: b, saved, pct, cheaper: saved > 0.0000005 };
}

/** 1k in / 1k out — enough to rank “how much cheaper than official”. */
export function cardSavings(ours: PriceQuote, official: OfficialQuote): PriceCompare {
  return compareCost(ours, official, 1000, 1000, 0);
}

export function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

export function formatSavePct(pct: number): string {
  const p = Math.max(0, Math.round(pct * 100));
  return `${p}%`;
}

export function formatOfficialFetchedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { hour12: false });
}
