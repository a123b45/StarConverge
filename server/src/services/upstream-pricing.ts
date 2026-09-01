/** NewAPI-compatible upstream pricing (/api/pricing). */

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

export function assertNewApiPricingHost(baseUrl: string) {
  const vendor = firstPartyVendorFromBaseUrl(baseUrl);
  if (!vendor) return;
  throw new Error(
    `${vendor} 是厂商官方 API，没有 NewAPI 的 /api/pricing，无法从这里同步价格。请改选 TAO-API 等中转站（DeepSeek 模型价在中转站价目里），或在定价中心按官网手工填写。`,
  );
}

export function pricingUrlFromBaseUrl(baseUrl: string): string {
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
          ? "（需要密钥或此站不是 NewAPI 价目接口；厂商官方如 DeepSeek 请改用中转站同步）"
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
