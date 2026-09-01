/** Official DeepSeek docs: USD per 1M tokens (peak / off-peak). */

export const DEEPSEEK_PRICING_DOCS_URL =
  "https://api-docs.deepseek.com/quick_start/pricing/";
export const DEEPSEEK_PRICING_DOCS_ZH_URL =
  "https://api-docs.deepseek.com/zh-cn/quick_start/pricing";

export const DEEPSEEK_GROUP_PEAK = "高峰时段";
export const DEEPSEEK_GROUP_OFF_PEAK = "空闲时段";

export const DEEPSEEK_PRICING_NOTE =
  "抓取官网英文美元价表（与系统 USD 计价一致；中文页同一套价）。高峰为工作日北京时间 09:00–12:00、14:00–18:00，空闲为其余时段且为高峰一半。进价建议选高峰，避免忙时成本被低估。";

export type DeepSeekQuote = {
  inputPer1m: number;
  outputPer1m: number;
  cacheHitPer1m: number;
};

export type DeepSeekModelPricing = {
  modelName: string;
  aliases: string[];
  peak: DeepSeekQuote;
  offPeak: DeepSeekQuote;
};

export function parseDeepSeekPricingHtml(html: string): DeepSeekModelPricing[] {
  const table = html.match(/<table[\s\S]*?PRICING[\s\S]*?<\/table>/i)?.[0];
  if (!table) {
    throw new Error("DeepSeek 文档未找到定价表，页面结构可能已改");
  }

  const headerRow = table.match(/MODEL[\s\S]*?<\/tr>/i)?.[0] ?? "";
  const models = [
    ...headerRow.matchAll(/<td[^>]*>\s*(deepseek-[a-z0-9._-]+)\s*<\/td>/gi),
  ].map((m) => m[1]!.toLowerCase());
  if (!models.length) {
    throw new Error("DeepSeek 文档定价表没有模型名");
  }

  const versionRow = table.match(/MODEL VERSION[\s\S]*?<\/tr>/i)?.[0] ?? "";
  const versions = [...versionRow.matchAll(/<td[^>]*>([^<]+)<\/td>/gi)]
    .map((m) => (m[1] ?? "").trim().toLowerCase())
    .filter((s) => s.startsWith("deepseek-"));

  const dollars = [...table.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)].map((m) =>
    Number(m[1]),
  );
  const expected = models.length * 6;
  if (dollars.length < expected || dollars.some((n) => !Number.isFinite(n))) {
    throw new Error(
      `DeepSeek 文档价格列不完整（期望 ${expected} 个金额，实际 ${dollars.length}）`,
    );
  }

  const n = models.length;
  const at = (kind: number, col: number) => dollars[kind * n + col]!;

  return models.map((modelName, col) => {
    const aliases = new Set<string>([modelName]);
    const versionAlias = versions[col];
    if (versionAlias) aliases.add(versionAlias);
    return {
      modelName,
      aliases: [...aliases],
      offPeak: {
        cacheHitPer1m: at(0, col),
        inputPer1m: at(2, col),
        outputPer1m: at(4, col),
      },
      peak: {
        cacheHitPer1m: at(1, col),
        inputPer1m: at(3, col),
        outputPer1m: at(5, col),
      },
    };
  });
}

export function normalizeDeepSeekGroup(group?: string): string {
  const s = (group ?? "").trim().toLowerCase();
  if (!s) return DEEPSEEK_GROUP_PEAK;
  if (
    s === "off-peak" ||
    s === "offpeak" ||
    s === "idle" ||
    s.includes("空闲") ||
    s.includes("闲时")
  ) {
    return DEEPSEEK_GROUP_OFF_PEAK;
  }
  if (s === "peak" || s.includes("高峰") || s.includes("peak")) {
    return DEEPSEEK_GROUP_PEAK;
  }
  throw new Error(
    `DeepSeek 不支持计费分组「${group}」，请选「${DEEPSEEK_GROUP_PEAK}」或「${DEEPSEEK_GROUP_OFF_PEAK}」`,
  );
}

export function deepSeekPricingVersion(models: DeepSeekModelPricing[]): string {
  const sig = models
    .map(
      (m) =>
        `${m.modelName}:${m.peak.inputPer1m}/${m.peak.outputPer1m}/${m.peak.cacheHitPer1m}`,
    )
    .join("|");
  let h = 0;
  for (let i = 0; i < sig.length; i += 1) {
    h = (h * 31 + sig.charCodeAt(i)) | 0;
  }
  return `ds-${(h >>> 0).toString(16)}`;
}

export async function fetchDeepSeekPricingHtml(timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(DEEPSEEK_PRICING_DOCS_URL, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
        "User-Agent":
          "StarConverge/1.0 (pricing-sync; +https://inkstudio.work)",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `DeepSeek 定价文档 ${res.status}: ${text.slice(0, 160)}`,
      );
    }
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("读取 DeepSeek 定价文档超时");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
