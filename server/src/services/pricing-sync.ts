import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels, modelPrices, modelRoutes, type Channel } from "../db/schema.js";
import { config } from "../config.js";
import { id, parseJsonArray } from "../utils/crypto.js";
import { notifyPricesChanged } from "./notifications.js";
import { explicitChannelModels } from "./upstream-models.js";
import {
  buildUpstreamPriceMap,
  fetchNewApiPricing,
  firstPartyVendorFromBaseUrl,
  pickCheapestGroup,
  pricingUrlFromBaseUrl,
} from "./upstream-pricing.js";

const PRICE_UNIT = 1000;

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
  scope: "channel" | "catalog" | "upstream",
  upstreamNames: string[],
) {
  const channelModels = explicitChannelModels(channel.models);
  const catalogModels = await catalogUpstreamModelsForChannel(channel.id);
  const upstreamSet = new Set(upstreamNames);
  if (scope === "upstream") {
    return upstreamNames.slice().sort((a, b) => a.localeCompare(b));
  }
  if (scope === "catalog") {
    return catalogModels.filter((m) => upstreamSet.has(m));
  }
  if (channelModels.length) {
    return channelModels.filter((m) => upstreamSet.has(m));
  }
  if (catalogModels.length) {
    return catalogModels.filter((m) => upstreamSet.has(m));
  }
  return upstreamNames.slice().sort((a, b) => a.localeCompare(b));
}

export type SyncPricingResult = {
  pricingUrl: string;
  group: string;
  pricingVersion: string;
  scope: "channel" | "catalog" | "upstream";
  targeted: number;
  created: number;
  updated: number;
  skipped: number;
  missingUpstream: number;
};

export async function syncChannelPricing(opts: {
  channel: Channel;
  group?: string;
  scope?: "channel" | "catalog" | "upstream";
  updateExisting?: boolean;
  createMissing?: boolean;
  setCostFromUpstream?: boolean;
}): Promise<SyncPricingResult> {
  const scope = opts.scope ?? "channel";
  const updateExisting = opts.updateExisting ?? true;
  const createMissing = opts.createMissing ?? true;
  const setCostFromUpstream = opts.setCostFromUpstream ?? true;
  const pricingUrl = pricingUrlFromBaseUrl(opts.channel.baseUrl);
  const payload = await fetchNewApiPricing(pricingUrl, opts.channel.timeoutMs, {
    apiKey: opts.channel.apiKey,
    baseUrl: opts.channel.baseUrl,
  });
  const group = opts.group || pickCheapestGroup(payload);
  if (!group) throw new Error("上游没有可用计费分组");
  const priceMap = buildUpstreamPriceMap(payload, group);
  const modelNames = await resolveSyncModelNames(opts.channel, scope, [
    ...priceMap.keys(),
  ]);
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
    const upstream = priceMap.get(modelName);
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
          remark: `上游同步 · ${group} · ${payload.pricing_version ?? ""}`.slice(0, 500),
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
      remark: `上游同步 · ${group} · ${payload.pricing_version ?? ""}`.slice(0, 500),
    });
    created += 1;
    changedNames.push(modelName);
  }

  if (changedNames.length) await notifyPricesChanged(changedNames);

  return {
    pricingUrl,
    group,
    pricingVersion: payload.pricing_version ?? "",
    scope,
    targeted: modelNames.length,
    created,
    updated,
    skipped,
    missingUpstream,
  };
}

export async function runDailyPricingSync() {
  const rows = await db.select().from(channels).where(eq(channels.enabled, true));
  const results: string[] = [];
  for (const ch of rows) {
    if (firstPartyVendorFromBaseUrl(ch.baseUrl)) {
      results.push(`跳过 ${ch.name}（厂商官方接口）`);
      continue;
    }
    try {
      const r = await syncChannelPricing({
        channel: ch,
        scope: "channel",
        updateExisting: true,
        createMissing: false,
        setCostFromUpstream: true,
      });
      results.push(
        `${ch.name} · ${r.group}：更新 ${r.updated}，跳过 ${r.skipped}，上游无价 ${r.missingUpstream}`,
      );
    } catch (e) {
      results.push(
        `${ch.name} 失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  console.log(`[pricing-auto-sync] ${results.join(" | ")}`);
}

export function startPricingAutoSync() {
  if (!config.pricingAutoSync) {
    console.log("[pricing-auto-sync] disabled");
    return;
  }
  const ms = config.pricingAutoSyncHours * 60 * 60 * 1000;
  const kickoff = 120_000;
  console.log(
    `[pricing-auto-sync] every ${config.pricingAutoSyncHours}h (first run in 2m)`,
  );
  setTimeout(() => {
    void runDailyPricingSync();
    setInterval(() => void runDailyPricingSync(), ms);
  }, kickoff);
}
