/**
 * First-party list prices (USD / 1M tokens) for portal comparison.
 *
 * Live source: LiteLLM's public map, which transcribes OpenAI / Anthropic /
 * Google / DeepSeek / DashScope (通义) published rates into JSON. We keep only
 * those first-party providers — never OpenRouter / Fireworks / 中转站 rows.
 *
 * https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json
 */

export type OfficialVendor =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "qwen";

export type OfficialQuote = {
  id: string;
  vendor: OfficialVendor;
  model: string;
  inputPer1m: number;
  outputPer1m: number;
  cacheHitPer1m: number;
  litellmKey: string;
};

export type OfficialPricingMeta = {
  source: "litellm" | "fallback";
  sourceUrl: string;
  fetchedAt: string | null;
  quoteCount: number;
};

const VENDOR_LABEL: Record<OfficialVendor, string> = {
  openai: "OpenAI 官方",
  anthropic: "Anthropic 官方",
  google: "Google 官方",
  deepseek: "DeepSeek 官方",
  qwen: "通义官方",
};

const FIRST_PARTY: Record<string, OfficialVendor> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
  deepseek: "deepseek",
  dashscope: "qwen",
};

const SOURCE_URLS = [
  "https://cdn.jsdelivr.net/gh/BerriAI/litellm@main/model_prices_and_context_window.json",
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
  "https://ghproxy.net/https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
];

const TTL_MS = Math.max(
  30 * 60 * 1000,
  Number(process.env.OFFICIAL_PRICE_TTL_HOURS ?? 6) * 3600 * 1000,
);

/** Used only until the first successful fetch (or if every mirror fails). Exact ids, no fuzzy class matching. */
const FALLBACK_QUOTES: OfficialQuote[] = [
  fb("gpt-4o-mini", "openai", 0.15, 0.6, 0.075),
  fb("gpt-4o", "openai", 2.5, 10, 1.25),
  fb("gpt-4.1-nano", "openai", 0.1, 0.4, 0.025),
  fb("gpt-4.1-mini", "openai", 0.4, 1.6, 0.1),
  fb("gpt-4.1", "openai", 2, 8, 0.5),
  fb("gpt-5-mini", "openai", 0.25, 2, 0.025),
  fb("gpt-5", "openai", 1.25, 10, 0.125),
  fb("o4-mini", "openai", 1.1, 4.4, 0.275),
  fb("o3-mini", "openai", 1.1, 4.4, 0.275),
  fb("o3", "openai", 2, 8, 0.5),
  fb("claude-haiku-4-5", "anthropic", 1, 5, 0.1),
  fb("claude-sonnet-4-5", "anthropic", 3, 15, 0.3),
  fb("claude-opus-4-5", "anthropic", 5, 25, 0.5),
  fb("claude-fable-5", "anthropic", 10, 50, 1),
  fb("gemini-2.5-flash", "google", 0.3, 2.5, 0.03),
  fb("gemini-2.5-pro", "google", 1.25, 10, 0.125),
  fb("gemini-2.0-flash", "google", 0.1, 0.4, 0.025),
  fb("deepseek-chat", "deepseek", 0.28, 0.42, 0.028),
  fb("deepseek-reasoner", "deepseek", 0.55, 2.19, 0.14),
  fb("qwen-turbo", "qwen", 0.05, 0.2, 0.02),
  fb("qwen-plus", "qwen", 0.4, 1.2, 0.16),
  fb("qwen-max", "qwen", 1.6, 6.4, 0.64),
];

function fb(
  id: string,
  vendor: OfficialVendor,
  inputPer1m: number,
  outputPer1m: number,
  cacheHitPer1m: number,
): OfficialQuote {
  return { id, vendor, model: id, inputPer1m, outputPer1m, cacheHitPer1m, litellmKey: id };
}

export function vendorLabel(vendor: OfficialVendor): string {
  return VENDOR_LABEL[vendor];
}

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

/** Drop dated snapshots so `claude-haiku-4-5-20251001` → `claude-haiku-4-5`. */
export function stripDatedSuffix(id: string): string {
  return id
    .replace(/-\d{8}(?:-v\d+)?$/, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-v\d+$/, "");
}

function per1m(perToken: unknown): number | null {
  const n = Number(perToken);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000 * 1e6) / 1e6;
}

function isChatMode(mode: unknown): boolean {
  return mode == null || mode === "chat" || mode === "responses";
}

function allowKey(vendor: OfficialVendor, key: string, id: string): boolean {
  if (key === "sample_spec" || key.startsWith("ft:")) return false;
  if (/embed(?:ding)?|moderation|whisper|(?:^|[-_/])tts(?:[-_/]|$)|realtime|transcribe|dall-e|imagen|video/.test(id)) {
    return false;
  }
  if (vendor === "qwen" && !/qwen|tongyi|qwq/.test(id)) return false;
  return true;
}

function preferGeneric(existing: OfficialQuote, next: OfficialQuote): OfficialQuote {
  const aDated = existing.model !== stripDatedSuffix(existing.model);
  const bDated = next.model !== stripDatedSuffix(next.model);
  if (aDated && !bDated) return next;
  if (!aDated && bDated) return existing;
  return existing.model.length <= next.model.length ? existing : next;
}

export function parseLiteLlmMap(data: unknown): OfficialQuote[] {
  if (!data || typeof data !== "object") return [];
  const byExact = new Map<string, OfficialQuote>();
  for (const [key, raw] of Object.entries(data as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const provider = String(row.litellm_provider ?? "");
    const vendor = FIRST_PARTY[provider];
    if (!vendor) continue;
    if (!isChatMode(row.mode)) continue;
    const inputPer1m = per1m(row.input_cost_per_token);
    const outputPer1m = per1m(row.output_cost_per_token);
    if (inputPer1m == null || outputPer1m == null) continue;
    const id = normalizeModelId(key);
    if (!id || !allowKey(vendor, key, id)) continue;
    const cacheRead = per1m(row.cache_read_input_token_cost);
    const quote: OfficialQuote = {
      id: stripDatedSuffix(id) || id,
      vendor,
      model: id,
      inputPer1m,
      outputPer1m,
      cacheHitPer1m: cacheRead ?? inputPer1m,
      litellmKey: key,
    };
    const prev = byExact.get(id);
    byExact.set(id, prev ? preferGeneric(prev, quote) : quote);
  }
  return [...byExact.values()].sort((a, b) => {
    if (a.vendor !== b.vendor) return a.vendor.localeCompare(b.vendor);
    return a.model.localeCompare(b.model);
  });
}

function indexQuotes(quotes: OfficialQuote[]) {
  const exact = new Map<string, OfficialQuote>();
  const stripped = new Map<string, OfficialQuote>();
  for (const q of quotes) {
    const n = normalizeModelId(q.model);
    const prevExact = exact.get(n);
    exact.set(n, prevExact ? preferGeneric(prevExact, q) : q);
    const s = stripDatedSuffix(n);
    const prevS = stripped.get(s);
    stripped.set(s, prevS ? preferGeneric(prevS, q) : q);
  }
  return { exact, stripped };
}

type Cache = {
  quotes: OfficialQuote[];
  exact: Map<string, OfficialQuote>;
  stripped: Map<string, OfficialQuote>;
  source: OfficialPricingMeta["source"];
  sourceUrl: string;
  fetchedAt: number | null;
};

function cacheFrom(quotes: OfficialQuote[], source: Cache["source"], sourceUrl: string, fetchedAt: number | null): Cache {
  return { quotes, source, sourceUrl, fetchedAt, ...indexQuotes(quotes) };
}

let cache = cacheFrom(FALLBACK_QUOTES, "fallback", "", null);
let inflight: Promise<void> | null = null;
let lastAttempt = 0;

export function officialPricingMeta(): OfficialPricingMeta {
  return {
    source: cache.source,
    sourceUrl: cache.sourceUrl,
    fetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
    quoteCount: cache.quotes.length,
  };
}

export function listOfficialQuotes(vendor?: OfficialVendor): OfficialQuote[] {
  const rows = vendor ? cache.quotes.filter((q) => q.vendor === vendor) : cache.quotes;
  const seen = new Set<string>();
  const out: OfficialQuote[] = [];
  for (const q of rows) {
    const id = q.id;
    if (seen.has(`${q.vendor}:${id}`)) continue;
    seen.add(`${q.vendor}:${id}`);
    out.push({ ...q, model: id });
  }
  return out;
}

export function matchOfficialQuote(
  model: string,
  rewriteModel?: string | null,
): OfficialQuote | null {
  const candidates = [model, rewriteModel ?? ""]
    .map((s) => normalizeModelId(s))
    .filter(Boolean);
  for (const n of candidates) {
    const hit = cache.exact.get(n);
    if (hit) return hit;
  }
  for (const n of candidates) {
    const hit = cache.stripped.get(stripDatedSuffix(n));
    if (hit) return hit;
  }
  return null;
}

export function publicOfficialQuote(q: OfficialQuote | null) {
  if (!q) return null;
  return {
    id: q.id,
    vendor: q.vendor,
    vendorLabel: vendorLabel(q.vendor),
    model: q.id,
    inputPer1m: q.inputPer1m,
    outputPer1m: q.outputPer1m,
    cacheHitPer1m: q.cacheHitPer1m,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { "user-agent": "StarConverge-official-pricing/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshOfficialPricing(): Promise<boolean> {
  lastAttempt = Date.now();
  let lastErr: unknown;
  for (const url of SOURCE_URLS) {
    try {
      const data = await fetchJson(url);
      const quotes = parseLiteLlmMap(data);
      if (quotes.length < 8) throw new Error(`too few quotes (${quotes.length})`);
      cache = cacheFrom(quotes, "litellm", url, Date.now());
      console.log(
        `[official-pricing] ${quotes.length} first-party quotes from ${url}`,
      );
      return true;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[official-pricing] fetch failed ${url}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (cache.source === "fallback") {
    console.warn(
      "[official-pricing] using baked-in fallback quotes",
      lastErr instanceof Error ? lastErr.message : lastErr,
    );
  }
  return false;
}

export async function ensureOfficialPricing(): Promise<void> {
  const age = cache.fetchedAt ? Date.now() - cache.fetchedAt : Number.POSITIVE_INFINITY;
  if (cache.source === "litellm" && age < TTL_MS) return;
  if (inflight) {
    await inflight;
    return;
  }
  if (lastAttempt && Date.now() - lastAttempt < 30_000) return;
  inflight = refreshOfficialPricing()
    .then(() => undefined)
    .finally(() => {
      inflight = null;
    });
  await inflight;
}

export function startOfficialPricingSync() {
  void ensureOfficialPricing();
  const tick = Math.min(TTL_MS, 6 * 3600 * 1000);
  setInterval(() => {
    void ensureOfficialPricing();
  }, tick);
}
