import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  appSettings,
  channels,
  modelPrices,
  modelRoutes,
  type Channel,
} from "../db/schema.js";
import { config } from "../config.js";
import { id, parseJsonArray } from "../utils/crypto.js";
import { notifyPricesChanged } from "./notifications.js";
import { explicitChannelModels } from "./upstream-models.js";
import {
  DEEPSEEK_GROUP_OFF_PEAK,
  normalizeDeepSeekGroup,
} from "./deepseek-pricing.js";
import {
  canSyncChannelPricing,
  loadChannelPricingCatalog,
  lookupUpstreamPrice,
  type ChannelPricingCatalog,
} from "./upstream-pricing.js";

const PRICE_UNIT = 1000;
const SETTINGS_KEY = "pricing_auto_sync";
const CHANNEL_ALL = "all";
const GROUP_ALL = "all";
const STARTUP_DELAY_MS = 120_000;

export type SyncScope = "channel" | "catalog" | "upstream";

export type PricingAutoSyncSettings = {
  enabled: boolean;
  intervalHours: number;
  channelId: string;
  group: string;
  deepseekGroup: string;
  scope: SyncScope;
  updateExisting: boolean;
  createMissing: boolean;
  setCostFromUpstream: boolean;
  lastRunAt: number | null;
  lastRunSummary: string;
};

export const DEFAULT_PRICING_AUTO_SYNC: PricingAutoSyncSettings = {
  enabled: true,
  intervalHours: 4,
  channelId: CHANNEL_ALL,
  group: GROUP_ALL,
  deepseekGroup: DEEPSEEK_GROUP_OFF_PEAK,
  scope: "catalog",
  updateExisting: true,
  createMissing: true,
  setCostFromUpstream: true,
  lastRunAt: null,
  lastRunSummary: "",
};

function priceUnitFromUsd(usd: number) {
  return Math.round(usd * PRICE_UNIT);
}

function usdFromPriceUnit(units: number) {
  return Math.round(units) / PRICE_UNIT;
}

function priceRowMatchesModel(
  row: typeof modelPrices.$inferSelect,
  channelId: string,
  modelName: string,
) {
  if (row.channelId !== channelId) return false;
  const name = modelName.trim();
  return (
    row.providerModel === name ||
    row.globalModel === name ||
    row.externalModel === name
  );
}

async function catalogUpstreamModelsForChannel(channelId: string) {
  const routes = await db.select().from(modelRoutes);
  const names = new Set<string>();
  for (const route of routes) {
    const channelIds = parseJsonArray(route.channelIds);
    if (!channelIds.includes(channelId)) continue;
    if (route.rewriteModel) names.add(route.rewriteModel);
    try {
      const raw = JSON.parse(route.targets || "[]") as unknown;
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (
            item &&
            typeof item === "object" &&
            typeof (item as { upstreamModel?: unknown }).upstreamModel === "string"
          ) {
            names.add((item as { upstreamModel: string }).upstreamModel);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [...names].sort();
}

async function resolveSyncModelNames(
  channel: Channel,
  scope: SyncScope,
  upstreamNames: string[],
) {
  const channelModels = explicitChannelModels(channel.models);
  const catalogModels = await catalogUpstreamModelsForChannel(channel.id);
  const upstreamSet = new Set(upstreamNames);
  if (scope === "upstream") {
    return upstreamNames.slice().sort((a, b) => a.localeCompare(b));
  }
  if (scope === "catalog") {
    return catalogModels;
  }
  if (channelModels.length) {
    return channelModels.filter((m) => upstreamSet.has(m));
  }
  if (catalogModels.length) {
    return catalogModels.filter((m) => upstreamSet.has(m));
  }
  return upstreamNames.slice().sort((a, b) => a.localeCompare(b));
}

function clampIntervalHours(n: number) {
  if (!Number.isFinite(n)) return DEFAULT_PRICING_AUTO_SYNC.intervalHours;
  return Math.min(168, Math.max(1, Math.round(n)));
}

export function normalizePricingAutoSyncSettings(
  raw: Partial<PricingAutoSyncSettings> | null | undefined,
): PricingAutoSyncSettings {
  const src = raw ?? {};
  const scope: SyncScope =
    src.scope === "channel" || src.scope === "upstream" || src.scope === "catalog"
      ? src.scope
      : DEFAULT_PRICING_AUTO_SYNC.scope;
  let deepseekGroup = DEFAULT_PRICING_AUTO_SYNC.deepseekGroup;
  try {
    deepseekGroup = normalizeDeepSeekGroup(
      src.deepseekGroup || DEFAULT_PRICING_AUTO_SYNC.deepseekGroup,
    );
  } catch {
    /* keep default */
  }
  return {
    enabled: src.enabled !== false,
    intervalHours: clampIntervalHours(
      Number(src.intervalHours ?? config.pricingAutoSyncHours),
    ),
    channelId: (src.channelId || CHANNEL_ALL).trim() || CHANNEL_ALL,
    group: (src.group || GROUP_ALL).trim() || GROUP_ALL,
    deepseekGroup,
    scope,
    updateExisting: src.updateExisting !== false,
    createMissing: src.createMissing !== false,
    setCostFromUpstream: src.setCostFromUpstream !== false,
    lastRunAt:
      typeof src.lastRunAt === "number" && Number.isFinite(src.lastRunAt)
        ? src.lastRunAt
        : null,
    lastRunSummary:
      typeof src.lastRunSummary === "string" ? src.lastRunSummary : "",
  };
}

export async function getPricingAutoSyncSettings(): Promise<PricingAutoSyncSettings> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SETTINGS_KEY))
    .limit(1);
  const row = rows[0];
  if (!row?.value) return { ...DEFAULT_PRICING_AUTO_SYNC };
  try {
    return normalizePricingAutoSyncSettings(
      JSON.parse(row.value) as Partial<PricingAutoSyncSettings>,
    );
  } catch {
    return { ...DEFAULT_PRICING_AUTO_SYNC };
  }
}

export async function savePricingAutoSyncSettings(
  patch: Partial<PricingAutoSyncSettings>,
): Promise<PricingAutoSyncSettings> {
  const current = await getPricingAutoSyncSettings();
  const next = normalizePricingAutoSyncSettings({ ...current, ...patch });
  const now = new Date();
  const existing = (
    await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, SETTINGS_KEY))
      .limit(1)
  )[0];
  const value = JSON.stringify(next);
  if (existing) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: now })
      .where(eq(appSettings.key, SETTINGS_KEY));
  } else {
    await db.insert(appSettings).values({
      key: SETTINGS_KEY,
      value,
      updatedAt: now,
    });
  }
  return next;
}

export function nextPricingAutoSyncAt(
  settings: PricingAutoSyncSettings,
  now = Date.now(),
): number | null {
  if (!config.pricingAutoSync || !settings.enabled) return null;
  const intervalMs = settings.intervalHours * 60 * 60 * 1000;
  if (!settings.lastRunAt) return now + STARTUP_DELAY_MS;
  const due = settings.lastRunAt + intervalMs;
  if (due <= now) return now + STARTUP_DELAY_MS;
  return due;
}

function pickSyncGroup(
  catalog: ChannelPricingCatalog,
  requested: string | undefined,
  deepseekGroup: string | undefined,
): string | null {
  const want = (requested || "").trim();
  const isAll = !want || want === GROUP_ALL;
  if (catalog.source === "deepseek-docs") {
    const raw = isAll ? deepseekGroup || DEEPSEEK_GROUP_OFF_PEAK : want;
    return normalizeDeepSeekGroup(raw);
  }
  if (isAll) return catalog.cheapestGroup;
  if (catalog.groups.some((g) => g.name === want)) return want;
  return catalog.cheapestGroup;
}

function collectUpstreamNames(
  catalog: ChannelPricingCatalog,
  group: string,
  allGroups: boolean,
): string[] {
  const names = new Set<string>(catalog.buildPriceMap(group).keys());
  if (allGroups && catalog.source === "newapi") {
    for (const g of catalog.groups) {
      if (g.name === group) continue;
      try {
        for (const key of catalog.buildPriceMap(g.name).keys()) names.add(key);
      } catch {
        /* skip */
      }
    }
  }
  return [...names];
}

export type SyncPricingResult = {
  pricingUrl: string;
  group: string;
  pricingVersion: string;
  scope: SyncScope;
  targeted: number;
  created: number;
  updated: number;
  skipped: number;
  missingUpstream: number;
};

export async function syncChannelPricing(opts: {
  channel: Channel;
  group?: string;
  deepseekGroup?: string;
  scope?: SyncScope;
  updateExisting?: boolean;
  createMissing?: boolean;
  setCostFromUpstream?: boolean;
}): Promise<SyncPricingResult> {
  const scope = opts.scope ?? "channel";
  const updateExisting = opts.updateExisting ?? true;
  const createMissing = opts.createMissing ?? true;
  const setCostFromUpstream = opts.setCostFromUpstream ?? true;
  const catalog = await loadChannelPricingCatalog({
    baseUrl: opts.channel.baseUrl,
    apiKey: opts.channel.apiKey,
    timeoutMs: opts.channel.timeoutMs,
  });
  const requested = (opts.group || "").trim();
  const allGroups = !requested || requested === GROUP_ALL;
  const group = pickSyncGroup(catalog, requested, opts.deepseekGroup);
  if (!group) throw new Error("上游没有可用计费分组");
  const pricingUrl = catalog.pricingUrl;
  const priceMap = catalog.buildPriceMap(group);
  const modelNames = await resolveSyncModelNames(
    opts.channel,
    scope,
    collectUpstreamNames(catalog, group, allGroups && catalog.source === "newapi"),
  );
  const existingRows = await db
    .select()
    .from(modelPrices)
    .where(eq(modelPrices.channelId, opts.channel.id));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let missingUpstream = 0;
  const changedNames: string[] = [];

  for (const modelName of modelNames) {
    const upstream =
      allGroups && catalog.source === "newapi"
        ? catalog.resolveBestForModel(modelName) ??
          lookupUpstreamPrice(priceMap, modelName)
        : lookupUpstreamPrice(priceMap, modelName);
    if (!upstream) {
      missingUpstream += 1;
      continue;
    }
    const existing = existingRows.find((row) =>
      priceRowMatchesModel(row, opts.channel.id, modelName),
    );
    const costPer1m = setCostFromUpstream
      ? upstream.inputPer1m
      : existing?.costPer1mCents
        ? usdFromPriceUnit(existing.costPer1mCents)
        : 0;
    const remarkGroup = upstream.group || group;

    if (existing) {
      if (!updateExisting) {
        skipped += 1;
        continue;
      }
      const nextInput = priceUnitFromUsd(upstream.inputPer1m);
      const nextOutput = priceUnitFromUsd(upstream.outputPer1m);
      const nextCache = priceUnitFromUsd(upstream.cacheHitPer1m);
      const priceMoved =
        nextInput !== existing.inputPer1mCents ||
        nextOutput !== existing.outputPer1mCents ||
        nextCache !== existing.cacheHitPer1mCents;
      await db
        .update(modelPrices)
        .set({
          inputPer1mCents: nextInput,
          outputPer1mCents: nextOutput,
          cacheHitPer1mCents: nextCache,
          costPer1mCents: priceUnitFromUsd(costPer1m),
          remark: `上游同步 · ${remarkGroup} · ${catalog.pricingVersion ?? ""}`.slice(
            0,
            500,
          ),
          updatedAt: new Date(),
        })
        .where(eq(modelPrices.id, existing.id));
      updated += 1;
      if (priceMoved) changedNames.push(modelName);
      continue;
    }

    if (!createMissing) {
      skipped += 1;
      continue;
    }

    await db.insert(modelPrices).values({
      id: id("price"),
      externalModel: modelName,
      globalModel: modelName,
      providerModel: modelName,
      channelId: opts.channel.id,
      inputPer1mCents: priceUnitFromUsd(upstream.inputPer1m),
      outputPer1mCents: priceUnitFromUsd(upstream.outputPer1m),
      cacheHitPer1mCents: priceUnitFromUsd(upstream.cacheHitPer1m),
      costPer1mCents: priceUnitFromUsd(costPer1m),
      enabled: true,
      remark: `上游同步 · ${remarkGroup} · ${catalog.pricingVersion ?? ""}`.slice(
        0,
        500,
      ),
    });
    created += 1;
    changedNames.push(modelName);
  }

  if (changedNames.length) await notifyPricesChanged(changedNames);

  return {
    pricingUrl,
    group,
    pricingVersion: catalog.pricingVersion ?? "",
    scope,
    targeted: modelNames.length,
    created,
    updated,
    skipped,
    missingUpstream,
  };
}

export type SyncAllChannelResult = {
  channelId: string;
  channelName: string;
  ok: boolean;
  skippedChannel?: boolean;
  error?: string;
} & Partial<SyncPricingResult>;

export type SyncAllResult = {
  ok: boolean;
  running?: boolean;
  summary: string;
  results: SyncAllChannelResult[];
};

let syncAllInFlight: Promise<SyncAllResult> | null = null;
let autoTimer: ReturnType<typeof setTimeout> | null = null;
let scheduleGen = 0;

export function schedulePricingAutoSync() {
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  const gen = ++scheduleGen;
  if (!config.pricingAutoSync) {
    console.log("[pricing-auto-sync] disabled by PRICING_AUTO_SYNC=0");
    return;
  }
  void getPricingAutoSyncSettings().then((settings) => {
    if (gen !== scheduleGen) return;
    if (!settings.enabled) {
      console.log("[pricing-auto-sync] disabled in admin settings");
      return;
    }
    const wait = waitMsUntilNext(settings) ?? STARTUP_DELAY_MS;
    console.log(
      `[pricing-auto-sync] every ${settings.intervalHours}h (next in ${Math.round(wait / 1000)}s, scope=${settings.scope})`,
    );
    autoTimer = setTimeout(() => {
      void (async () => {
        try {
          await runPricingSyncAll();
        } catch (e) {
          console.error("[pricing-auto-sync]", e);
        } finally {
          schedulePricingAutoSync();
        }
      })();
    }, wait);
  });
}

export async function runPricingSyncAll(
  patch?: Partial<PricingAutoSyncSettings>,
): Promise<SyncAllResult> {
  if (syncAllInFlight) {
    return {
      ok: false,
      running: true,
      summary: "已有同步任务在进行中",
      results: [],
    };
  }
  const job = (async () => {
    const settings = normalizePricingAutoSyncSettings({
      ...(await getPricingAutoSyncSettings()),
      ...patch,
    });
    const rows = await db.select().from(channels).where(eq(channels.enabled, true));
    const selected =
      settings.channelId && settings.channelId !== CHANNEL_ALL
        ? rows.filter((ch) => ch.id === settings.channelId)
        : rows;

    const results: SyncAllChannelResult[] = [];
    for (const ch of selected) {
      if (!canSyncChannelPricing(ch.baseUrl)) {
        results.push({
          channelId: ch.id,
          channelName: ch.name,
          ok: false,
          skippedChannel: true,
          error: "厂商官方暂无定价适配",
        });
        continue;
      }
      try {
        const r = await syncChannelPricing({
          channel: ch,
          group: settings.group,
          deepseekGroup: settings.deepseekGroup,
          scope: settings.scope,
          updateExisting: settings.updateExisting,
          createMissing: settings.createMissing,
          setCostFromUpstream: settings.setCostFromUpstream,
        });
        results.push({
          channelId: ch.id,
          channelName: ch.name,
          ok: true,
          ...r,
        });
      } catch (e) {
        results.push({
          channelId: ch.id,
          channelName: ch.name,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const synced = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok && !r.skipped).length;
    const skipped = results.filter((r) => r.skippedChannel).length;
    const updated = results.reduce((n, r) => n + (r.updated ?? 0), 0);
    const created = results.reduce((n, r) => n + (r.created ?? 0), 0);
    const parts = [
      `服务商 ${synced}/${selected.length}`,
      created ? `新建 ${created}` : "",
      `更新 ${updated}`,
      failed ? `失败 ${failed}` : "",
      skipped ? `跳过 ${skipped}` : "",
    ].filter(Boolean);
    const summary = parts.join("，") || "没有可同步的服务商";
    await savePricingAutoSyncSettings({
      lastRunAt: Date.now(),
      lastRunSummary: summary,
    });
    console.log(`[pricing-auto-sync] ${summary} | ${results.map((r) => `${r.channelName}${r.ok ? "" : `:${r.error ?? "skip"}`}`).join(" | ")}`);
    return {
      ok: failed === 0,
      summary,
      results,
    };
  })();

  syncAllInFlight = job;
  try {
    return await job;
  } finally {
    syncAllInFlight = null;
  }
}

export async function runDailyPricingSync() {
  return runPricingSyncAll();
}

function waitMsUntilNext(settings: PricingAutoSyncSettings) {
  if (!config.pricingAutoSync || !settings.enabled) return null;
  const intervalMs = settings.intervalHours * 60 * 60 * 1000;
  if (!settings.lastRunAt) return STARTUP_DELAY_MS;
  const remain = settings.lastRunAt + intervalMs - Date.now();
  if (remain <= 0) return STARTUP_DELAY_MS;
  return remain;
}

export function startPricingAutoSync() {
  schedulePricingAutoSync();
}
