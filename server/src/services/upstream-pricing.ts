/** Upstream pricing: NewAPI `/api/pricing`, plus vendor-specific docs (DeepSeek). */

import {
  DEEPSEEK_GROUP_OFF_PEAK,
  DEEPSEEK_GROUP_PEAK,
  DEEPSEEK_PRICING_DOCS_URL,
  DEEPSEEK_PRICING_NOTE,
  deepSeekPricingVersion,
  fetchDeepSeekPricingHtml,
  normalizeDeepSeekGroup,
  parseDeepSeekPricingHtml,
  type DeepSeekModelPricing,
} from "./deepseek-pricing.js";

export type NewApiPricingRow = {
  model_name: string;
  quota_type?: number;
  model_ratio?: number;
  model_price?: number;
  completion_ratio?: number;
  cache_ratio?: number;
  enable_groups?: string[];
  billing_mode?: string;
  billing_expr?: string;
};

export type NewApiPricingPayload = {
  success?: boolean;
  data?: NewApiPricingRow[];
  group_ratio?: Record<string, number>;
  auto_groups?: string[];
  pricing_version?: string;
};

export type ResolvedUpstreamPrice = {
  modelName: string;
  inputPer1m: number;
  outputPer1m: number;
  cacheHitPer1m: number;
  group: string;
};

/** NewAPI: $1 quota == 500_000 points; 1M input tokens at ratio 1 == $2. */
const USD_PER_RATIO_MILLION = 2;

const FIRST_PARTY_HOSTS: Array<{ test: (host: string) => boolean; vendor: string }> = [
  { test: (h) => h === "api.deepseek.com" || h.endsWith(".deepseek.com"), vendor: "DeepSeek" },
  { test: (h) => h === "api.openai.com" || h.endsWith(".openai.azure.com"), vendor: "OpenAI" },
  { test: (h) => h === "api.anthropic.com" || h.endsWith(".anthropic.com"), vendor: "Anthropic" },
  { test: (h) => h.includes("googleapis.com") || h.includes("generativelanguage"), vendor: "Google" },
  { test: (h) => h === "api.x.ai" || h.endsWith(".x.ai"), vendor: "xAI / Grok" },
  { test: (h) => h.includes("moonshot.cn") || h.includes("moonshot.ai"), vendor: "Moonshot" },
  { test: (h) => h.includes("bigmodel.cn"), vendor: "智谱" },
  { test: (h) => h.includes("dashscope.aliyuncs.com"), vendor: "阿里云" },
  { test: (h) => h.includes("minimax.chat") || h.includes("minimaxi.com"), vendor: "MiniMax" },
];

export function firstPartyVendorFromBaseUrl(baseUrl: string): string | null {
  const raw = baseUrl.trim();
  if (!raw) return null;
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
    const hit = FIRST_PARTY_HOSTS.find((row) => row.test(host));
    return hit?.vendor ?? null;
  } catch {
    return null;
  }
}

export function hasOfficialPricingAdapter(baseUrl: string): boolean {
  return firstPartyVendorFromBaseUrl(baseUrl) === "DeepSeek";
}

export function canSyncChannelPricing(baseUrl: string): boolean {
  const vendor = firstPartyVendorFromBaseUrl(baseUrl);
  return !vendor || hasOfficialPricingAdapter(baseUrl);
}

export function assertNewApiPricingHost(baseUrl: string) {
  const vendor = firstPartyVendorFromBaseUrl(baseUrl);
  if (!vendor) return;
  if (vendor === "DeepSeek") {
    throw new Error(
      "DeepSeek 官方没有 NewAPI 的 /api/pricing；请走官网价目同步，不要对 api.deepseek.com 请求该接口。",
    );
  }
  throw new Error(
    `${vendor} 是厂商官方 API，没有 NewAPI 的 /api/pricing，也无法从官网自动抓价。请改选 TAO-API 等中转站，或在定价中心按官网手工填写。`,
  );
}

export function pricingUrlFromBaseUrl(baseUrl: string): string {
  if (firstPartyVendorFromBaseUrl(baseUrl) === "DeepSeek") {
    return DEEPSEEK_PRICING_DOCS_URL;
  }
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  let origin = trimmed;
  try {
    const u = new URL(trimmed);
    origin = u.origin;
  } catch {
    origin = trimmed.replace(/\/v\d+$/, "").replace(/\/api$/, "");
  }
  return `${origin}/api/pricing`;
}

export async function fetchNewApiPricing(
  pricingUrl: string,
  timeoutMs = 20_000,
  opts?: { apiKey?: string; baseUrl?: string },
): Promise<NewApiPricingPayload> {
  if (opts?.baseUrl) assertNewApiPricingHost(opts.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const key = opts?.apiKey?.trim();
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(pricingUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? "（需要密钥或此站不是 NewAPI 价目接口）"
          : "";
      throw new Error(
        `上游定价接口 ${res.status}: ${text.slice(0, 160)}${hint}`,
      );
    }
    const json = JSON.parse(text) as NewApiPricingPayload;
    if (!Array.isArray(json.data)) {
      throw new Error("上游未返回模型定价列表");
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function roundUsd(n: number) {
  return Math.round(n * 1000) / 1000;
}

function parseBillingCoefficients(expr: string): { p: number; c: number; cr: number } | null {
  const normalized = expr.replace(/\s+/g, " ");
  const tierBody =
    normalized.match(/off_peak[^)]*?(p\s*\*\s*[\d.]+[^)]*)/i)?.[1] ??
    normalized.match(/tier\([^,]+,\s*([^)]+)\)/i)?.[1] ??
    normalized;
  const match = tierBody.match(
    /p\s*\*\s*([\d.]+)(?:\s*\+\s*c\s*\*\s*([\d.]+))?(?:\s*\+\s*cr\s*\*\s*([\d.]+))?/i,
  );
  if (!match) return null;
  return {
    p: Number(match[1]) || 0,
    c: Number(match[2]) || 0,
    cr: Number(match[3]) || 0,
  };
}

export function resolveNewApiModelUsd(
  row: NewApiPricingRow,
  groupRatio: number,
): { inputPer1m: number; outputPer1m: number; cacheHitPer1m: number } | null {
  if (row.quota_type === 1) return null;

  if (row.billing_expr) {
    const coef = parseBillingCoefficients(row.billing_expr);
    if (!coef || coef.p <= 0) return null;
    const input = coef.p * groupRatio * USD_PER_RATIO_MILLION;
    const output =
      coef.c > 0
        ? coef.c * groupRatio * USD_PER_RATIO_MILLION
        : input * (row.completion_ratio ?? 1);
    const cache =
      coef.cr > 0
        ? coef.cr * groupRatio * USD_PER_RATIO_MILLION
        : input * (row.cache_ratio ?? 0);
    return {
      inputPer1m: roundUsd(input),
      outputPer1m: roundUsd(output),
      cacheHitPer1m: roundUsd(cache),
    };
  }

  const modelRatio = row.model_ratio ?? 0;
  if (modelRatio <= 0) return null;
  const input = modelRatio * groupRatio * USD_PER_RATIO_MILLION;
  const completion = row.completion_ratio ?? 1;
  const cache = row.cache_ratio ?? 0;
  return {
    inputPer1m: roundUsd(input),
    outputPer1m: roundUsd(input * completion),
    cacheHitPer1m: roundUsd(input * cache),
  };
}

export function listNewApiGroups(payload: NewApiPricingPayload): Array<{
  name: string;
  ratio: number;
}> {
  const ratios = payload.group_ratio ?? {};
  const names = new Set<string>([
    ...(payload.auto_groups ?? []),
    ...Object.keys(ratios),
  ]);
  return [...names]
    .filter((name) => name && name !== "Free")
    .map((name) => ({
      name,
      ratio: ratios[name] ?? 1,
    }))
    .sort((a, b) => a.ratio - b.ratio || a.name.localeCompare(b.name));
}

export function pickDefaultGroup(
  payload: NewApiPricingPayload,
  preferred?: string,
): string | null {
  const groups = listNewApiGroups(payload);
  if (!groups.length) return null;
  if (preferred && groups.some((g) => g.name === preferred)) return preferred;
  const svip = groups.find((g) => g.name.toLowerCase() === "svip");
  if (svip) return svip.name;
  return groups[0]!.name;
}

/** Lowest group_ratio (cheapest NewAPI billing group). */
export function pickCheapestGroup(payload: NewApiPricingPayload): string | null {
  const groups = listNewApiGroups(payload);
  return groups[0]?.name ?? null;
}

export function buildUpstreamPriceMap(
  payload: NewApiPricingPayload,
  groupName: string,
): Map<string, ResolvedUpstreamPrice> {
  const groupRatio = payload.group_ratio?.[groupName];
  if (groupRatio == null) {
    throw new Error(`上游不存在分组「${groupName}」`);
  }

  const out = new Map<string, ResolvedUpstreamPrice>();
  for (const row of payload.data ?? []) {
    const name = (row.model_name || "").trim();
    if (!name) continue;
    if (row.enable_groups?.length && !row.enable_groups.includes(groupName)) {
      continue;
    }
    const usd = resolveNewApiModelUsd(row, groupRatio);
    if (!usd || (usd.inputPer1m <= 0 && usd.outputPer1m <= 0)) continue;
    out.set(name, {
      modelName: name,
      inputPer1m: usd.inputPer1m,
      outputPer1m: usd.outputPer1m,
      cacheHitPer1m: usd.cacheHitPer1m,
      group: groupName,
    });
  }
  return out;
}

/** Pick the cheapest enabled upstream group price for a model. */
export function resolveBestPriceForModel(
  payload: NewApiPricingPayload,
  modelName: string,
): ResolvedUpstreamPrice | null {
  const name = modelName.trim();
  if (!name) return null;
  const row = payload.data?.find((m) => (m.model_name || "").trim() === name);
  if (!row) return null;

  const groupNames = row.enable_groups?.length
    ? row.enable_groups.filter((g) => g && g !== "Free")
    : listNewApiGroups(payload).map((g) => g.name);

  let best: ResolvedUpstreamPrice | null = null;
  for (const groupName of groupNames) {
    const groupRatio = payload.group_ratio?.[groupName];
    if (groupRatio == null) continue;
    const usd = resolveNewApiModelUsd(row, groupRatio);
    if (!usd || (usd.inputPer1m <= 0 && usd.outputPer1m <= 0)) continue;
    const candidate: ResolvedUpstreamPrice = {
      modelName: name,
      inputPer1m: usd.inputPer1m,
      outputPer1m: usd.outputPer1m,
      cacheHitPer1m: usd.cacheHitPer1m,
      group: groupName,
    };
    if (!best || candidate.inputPer1m < best.inputPer1m) {
      best = candidate;
    }
  }
  return best;
}

export function lookupUpstreamPrice(
  map: Map<string, ResolvedUpstreamPrice>,
  modelName: string,
): ResolvedUpstreamPrice | undefined {
  const raw = modelName.trim();
  if (!raw) return undefined;
  const exact = map.get(raw) ?? map.get(raw.toLowerCase());
  if (exact) return exact;
  const stripped = raw.toLowerCase().replace(/-\d{4}$/, "");
  if (stripped !== raw.toLowerCase()) {
    const parent = map.get(stripped);
    if (parent) return { ...parent, modelName: raw };
  }
  return undefined;
}

function buildDeepSeekPriceMap(
  models: DeepSeekModelPricing[],
  groupName: string,
): Map<string, ResolvedUpstreamPrice> {
  const group = normalizeDeepSeekGroup(groupName);
  const peak = group === DEEPSEEK_GROUP_PEAK;
  const out = new Map<string, ResolvedUpstreamPrice>();
  for (const row of models) {
    const quote = peak ? row.peak : row.offPeak;
    for (const alias of row.aliases) {
      out.set(alias, {
        modelName: alias,
        inputPer1m: quote.inputPer1m,
        outputPer1m: quote.outputPer1m,
        cacheHitPer1m: quote.cacheHitPer1m,
        group,
      });
    }
  }
  return out;
}

export type ChannelPricingCatalog = {
  source: "newapi" | "deepseek-docs";
  pricingUrl: string;
  pricingVersion: string;
  note: string;
  groups: Array<{ name: string; ratio: number }>;
  defaultGroup: string | null;
  cheapestGroup: string | null;
  buildPriceMap: (groupName: string) => Map<string, ResolvedUpstreamPrice>;
  resolveBestForModel: (modelName: string) => ResolvedUpstreamPrice | null;
};

export async function loadChannelPricingCatalog(opts: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<ChannelPricingCatalog> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const vendor = firstPartyVendorFromBaseUrl(opts.baseUrl);

  if (vendor === "DeepSeek") {
    const html = await fetchDeepSeekPricingHtml(timeoutMs);
    const models = parseDeepSeekPricingHtml(html);
    const peakMap = buildDeepSeekPriceMap(models, DEEPSEEK_GROUP_PEAK);
    return {
      source: "deepseek-docs",
      pricingUrl: DEEPSEEK_PRICING_DOCS_URL,
      pricingVersion: deepSeekPricingVersion(models),
      note: DEEPSEEK_PRICING_NOTE,
      groups: [
        { name: DEEPSEEK_GROUP_PEAK, ratio: 1 },
        { name: DEEPSEEK_GROUP_OFF_PEAK, ratio: 0.5 },
      ],
      defaultGroup: DEEPSEEK_GROUP_PEAK,
      cheapestGroup: DEEPSEEK_GROUP_OFF_PEAK,
      buildPriceMap: (groupName) => buildDeepSeekPriceMap(models, groupName),
      resolveBestForModel: (modelName) =>
        lookupUpstreamPrice(peakMap, modelName) ?? null,
    };
  }

  if (vendor) {
    throw new Error(
      `${vendor} 是厂商官方 API，尚未接入独立价目源。请改选 TAO-API 等中转站，或在定价中心按官网手工填写。`,
    );
  }

  const pricingUrl = pricingUrlFromBaseUrl(opts.baseUrl);
  const payload = await fetchNewApiPricing(pricingUrl, timeoutMs, {
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
  });
  const groups = listNewApiGroups(payload);
  const cheapestGroup = pickCheapestGroup(payload);
  return {
    source: "newapi",
    pricingUrl,
    pricingVersion: payload.pricing_version ?? "",
    note: "",
    groups,
    defaultGroup: pickDefaultGroup(payload),
    cheapestGroup,
    buildPriceMap: (groupName) => buildUpstreamPriceMap(payload, groupName),
    resolveBestForModel: (modelName) =>
      resolveBestPriceForModel(payload, modelName),
  };
}

export function upstreamModelNameForChannel(
  route: {
    model: string;
    channelIds: string[];
    rewriteModel: string | null;
    targets: Array<{ channelId: string; upstreamModel: string }>;
  },
  channelId: string,
): string {
  const target = route.targets.find((t) => t.channelId === channelId);
  if (target?.upstreamModel) return target.upstreamModel;
  if (route.rewriteModel) return route.rewriteModel;
  return route.model;
}
