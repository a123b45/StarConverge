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
