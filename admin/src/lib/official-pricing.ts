import { detectModelFamily, type ModelFamily } from "./model-taxonomy";
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
  model: string;
  family: Exclude<ModelFamily, "all">;
  match: RegExp;
};

export const OFFICIAL_VENDORS: Array<{ id: OfficialVendor; label: string }> = [
  { id: "openai", label: "OpenAI 官方" },
  { id: "anthropic", label: "Anthropic 官方" },
  { id: "google", label: "Google 官方" },
  { id: "deepseek", label: "DeepSeek 官方" },
  { id: "qwen", label: "通义官方" },
];

/** Public list prices in USD / 1M tokens. Closest-class match only — never a 中转站. */
export const OFFICIAL_QUOTES: OfficialQuote[] = [
  {
    id: "gpt-4o-mini",
    vendor: "openai",
    family: "gpt",
    model: "gpt-4o-mini",
    match: /gpt-4o-mini|chatgpt-4o-mini/,
    inputPer1m: 0.15,
    outputPer1m: 0.6,
    cacheHitPer1m: 0.075,
  },
  {
    id: "gpt-4o",
    vendor: "openai",
    family: "gpt",
    model: "gpt-4o",
    match: /gpt-4o(?!-mini)|chatgpt-4o(?!-mini)/,
    inputPer1m: 2.5,
    outputPer1m: 10,
    cacheHitPer1m: 1.25,
  },
  {
    id: "gpt-4.1-nano",
    vendor: "openai",
    family: "gpt",
    model: "gpt-4.1-nano",
    match: /gpt-4\.1-nano|gpt-4-1-nano/,
    inputPer1m: 0.1,
    outputPer1m: 0.4,
    cacheHitPer1m: 0.025,
  },
  {
    id: "gpt-4.1-mini",
    vendor: "openai",
    family: "gpt",
    model: "gpt-4.1-mini",
    match: /gpt-4\.1-mini|gpt-4-1-mini/,
    inputPer1m: 0.4,
    outputPer1m: 1.6,
    cacheHitPer1m: 0.1,
  },
  {
    id: "gpt-4.1",
    vendor: "openai",
    family: "gpt",
    model: "gpt-4.1",
    match: /gpt-4\.1(?!-mini|-nano)|gpt-4-1(?!-mini|-nano)/,
    inputPer1m: 2,
    outputPer1m: 8,
    cacheHitPer1m: 0.5,
  },
  {
    id: "o4-mini",
    vendor: "openai",
    family: "gpt",
    model: "o4-mini",
    match: /o4-mini/,
    inputPer1m: 1.1,
    outputPer1m: 4.4,
    cacheHitPer1m: 0.275,
  },
  {
    id: "o3-mini",
    vendor: "openai",
    family: "gpt",
    model: "o3-mini",
    match: /o3-mini/,
    inputPer1m: 1.1,
    outputPer1m: 4.4,
    cacheHitPer1m: 0.275,
  },
  {
    id: "o3",
    vendor: "openai",
    family: "gpt",
    model: "o3",
    match: /(?:^|[-_/])o3(?:[-_/]|$)/,
    inputPer1m: 2,
    outputPer1m: 8,
    cacheHitPer1m: 0.5,
  },
  {
    id: "gpt-5-mini",
    vendor: "openai",
    family: "gpt",
    model: "gpt-5-mini",
    match: /gpt-5-mini|gpt-5\.1-mini/,
    inputPer1m: 0.25,
    outputPer1m: 2,
    cacheHitPer1m: 0.025,
  },
  {
    id: "gpt-5",
    vendor: "openai",
    family: "gpt",
    model: "gpt-5",
    match: /gpt-5(?!-mini)/,
    inputPer1m: 1.25,
    outputPer1m: 10,
    cacheHitPer1m: 0.125,
  },
  {
    id: "claude-haiku-4.5",
    vendor: "anthropic",
    family: "claude",
    model: "claude-haiku-4-5",
    match: /haiku/,
    inputPer1m: 1,
    outputPer1m: 5,
    cacheHitPer1m: 0.1,
  },
  {
    id: "claude-sonnet-4.5",
    vendor: "anthropic",
    family: "claude",
    model: "claude-sonnet-4-5",
    match: /sonnet|fable|claude-3[.-]?5-sonnet|claude-3[.-]?7/,
    inputPer1m: 3,
    outputPer1m: 15,
    cacheHitPer1m: 0.3,
  },
  {
    id: "claude-opus-4.5",
    vendor: "anthropic",
    family: "claude",
    model: "claude-opus-4-5",
    match: /opus/,
    inputPer1m: 15,
    outputPer1m: 75,
    cacheHitPer1m: 1.5,
  },
  {
    id: "gemini-2.5-flash",
    vendor: "google",
    family: "gemini",
    model: "gemini-2.5-flash",
    match: /gemini-2\.5-flash|gemini-2-5-flash|gemini-flash/,
    inputPer1m: 0.15,
    outputPer1m: 0.6,
    cacheHitPer1m: 0.0375,
  },
  {
    id: "gemini-2.5-pro",
    vendor: "google",
    family: "gemini",
    model: "gemini-2.5-pro",
    match: /gemini-2\.5-pro|gemini-2-5-pro|gemini-pro|gemini-1\.5-pro/,
    inputPer1m: 1.25,
    outputPer1m: 10,
    cacheHitPer1m: 0.31,
  },
  {
    id: "gemini-2.0-flash",
    vendor: "google",
    family: "gemini",
    model: "gemini-2.0-flash",
    match: /gemini-2\.0-flash|gemini-2-0-flash/,
    inputPer1m: 0.1,
    outputPer1m: 0.4,
    cacheHitPer1m: 0.025,
  },
  {
    id: "deepseek-chat",
    vendor: "deepseek",
    family: "deepseek",
    model: "deepseek-chat",
    match: /deepseek-chat|deepseek-v3/,
    inputPer1m: 0.27,
    outputPer1m: 1.1,
    cacheHitPer1m: 0.07,
  },
  {
    id: "deepseek-reasoner",
    vendor: "deepseek",
    family: "deepseek",
    model: "deepseek-reasoner",
    match: /deepseek-reasoner|deepseek-r1/,
    inputPer1m: 0.55,
    outputPer1m: 2.19,
    cacheHitPer1m: 0.14,
  },
  {
    id: "qwen-turbo",
    vendor: "qwen",
    family: "qwen",
    model: "qwen-turbo",
    match: /qwen-turbo|qwen2\.5-7b|qwen2-7b/,
    inputPer1m: 0.05,
    outputPer1m: 0.2,
    cacheHitPer1m: 0.02,
  },
  {
    id: "qwen-plus",
    vendor: "qwen",
    family: "qwen",
    model: "qwen-plus",
    match: /qwen-plus|qwen2\.5-72b|qwen2-72b/,
    inputPer1m: 0.4,
    outputPer1m: 1.2,
    cacheHitPer1m: 0.16,
  },
  {
    id: "qwen-max",
    vendor: "qwen",
    family: "qwen",
    model: "qwen-max",
    match: /qwen-max|qwen3-max|qwq/,
    inputPer1m: 1.6,
    outputPer1m: 6.4,
    cacheHitPer1m: 0.64,
  },
];

export function vendorLabel(id: OfficialVendor): string {
  return OFFICIAL_VENDORS.find((v) => v.id === id)?.label ?? id;
}

export function quotesForVendor(vendor: OfficialVendor): OfficialQuote[] {
  return OFFICIAL_QUOTES.filter((q) => q.vendor === vendor);
}

export function matchOfficialQuote(model: string): OfficialQuote | null {
  const n = model.trim().toLowerCase();
  let best: OfficialQuote | null = null;
  let score = 0;
  for (const q of OFFICIAL_QUOTES) {
    if (!q.match.test(n)) continue;
    const next = q.match.source.length;
    if (next > score) {
      best = q;
      score = next;
    }
  }
  return best;
}

export function defaultVendorForModel(model: string): OfficialVendor {
  const hit = matchOfficialQuote(model);
  if (hit) return hit.vendor;
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
