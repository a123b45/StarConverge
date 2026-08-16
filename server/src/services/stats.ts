import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels, modelRoutes, requestLogs, tokens } from "../db/schema.js";
import { id, parseJsonArray } from "../utils/crypto.js";
import { parseIpRules } from "../utils/ip-allow.js";

export async function writeLog(input: {
  tokenId?: string | null;
  channelId?: string | null;
  model?: string | null;
  upstreamModel?: string | null;
  path: string;
  method: string;
  statusCode?: number | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number | null;
  ip?: string | null;
  error?: string | null;
  requestPreview?: string | null;
  responsePreview?: string | null;
  messageCount?: number;
}) {
  await db.insert(requestLogs).values({
    id: id("log"),
    tokenId: input.tokenId ?? null,
    channelId: input.channelId ?? null,
    model: input.model ?? null,
    upstreamModel: input.upstreamModel ?? null,
    path: input.path,
    method: input.method,
    statusCode: input.statusCode ?? null,
    promptTokens: input.promptTokens ?? 0,
    completionTokens: input.completionTokens ?? 0,
    totalTokens: input.totalTokens ?? 0,
    durationMs: input.durationMs ?? null,
    ip: input.ip ?? null,
    error: input.error ?? null,
    requestPreview: input.requestPreview ?? null,
    responsePreview: input.responsePreview ?? null,
    messageCount: input.messageCount ?? 0,
  });

  if (input.tokenId && (input.totalTokens ?? 0) > 0) {
    await db
      .update(tokens)
      .set({
        usedQuota: sql`${tokens.usedQuota} + ${input.totalTokens}`,
        updatedAt: new Date(),
      })
      .where(eq(tokens.id, input.tokenId));
  }
}

export async function getDashboardStats(
  grain: "hour" | "minute" | "day" = "hour",
) {
  const sinceMs =
    grain === "minute"
      ? 60 * 60 * 1000
      : grain === "day"
        ? 30 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceTrend = new Date(Date.now() - sinceMs);
  const [totals] = await db
    .select({
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)`,
      errors: sql<number>`sum(case when ${requestLogs.statusCode} >= 400 or ${requestLogs.error} is not null then 1 else 0 end)`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, since24h));

  const [allTime] = await db
    .select({
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)`,
    })
    .from(requestLogs);

  const [channelAll] = await db
    .select({ c: sql<number>`count(*)` })
    .from(channels);
  const [channelOn] = await db
    .select({ c: sql<number>`count(*)` })
    .from(channels)
    .where(eq(channels.enabled, true));
  const [tokenAll] = await db.select({ c: sql<number>`count(*)` }).from(tokens);
  const [tokenOn] = await db
    .select({ c: sql<number>`count(*)` })
    .from(tokens)
    .where(eq(tokens.enabled, true));
  const [routeCount] = await db
    .select({ c: sql<number>`count(*)` })
    .from(modelRoutes)
    .where(eq(modelRoutes.enabled, true));

  const recent = await db
    .select()
    .from(requestLogs)
    .orderBy(desc(requestLogs.createdAt))
    .limit(20);

  const byModel = await db
    .select({
      model: requestLogs.model,
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)`,
    })
    .from(requestLogs)
    .where(and(gte(requestLogs.createdAt, since24h)))
    .groupBy(requestLogs.model)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const bucketExpr =
    grain === "minute"
      ? sql`strftime('%Y-%m-%d %H:%M', ${requestLogs.createdAt} / 1000, 'unixepoch', 'localtime')`
      : grain === "day"
        ? sql`strftime('%Y-%m-%d', ${requestLogs.createdAt} / 1000, 'unixepoch', 'localtime')`
        : sql`strftime('%Y-%m-%d %H:00', ${requestLogs.createdAt} / 1000, 'unixepoch', 'localtime')`;

  const trendRaw = await db
    .select({
      bucket: bucketExpr,
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, sinceTrend))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  const trend = fillTrendBuckets(
    grain,
    sinceMs,
    trendRaw.map((r) => ({
      hour: String(r.bucket),
      requests: Number(r.requests),
      tokens: Number(r.tokens),
    })),
  );

  const modelExpr = sql`coalesce(${requestLogs.model}, '(unknown)')`;
  const trendByModelRaw = await db
    .select({
      bucket: bucketExpr,
      model: modelExpr,
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, sinceTrend))
    .groupBy(bucketExpr, modelExpr)
    .orderBy(bucketExpr);

  const modelKeys = [
    ...new Set(trendByModelRaw.map((r) => String(r.model || "(unknown)"))),
  ];
  const modelTrend = modelKeys.map((model) => {
    const raw = trendByModelRaw
      .filter((r) => String(r.model || "(unknown)") === model)
      .map((r) => ({
        hour: String(r.bucket),
        requests: Number(r.requests),
        tokens: Number(r.tokens),
      }));
    return {
      model,
      series: fillTrendBuckets(grain, sinceMs, raw),
    };
  }).sort((a, b) => {
    const ta = a.series.reduce((s, p) => s + p.tokens, 0);
    const tb = b.series.reduce((s, p) => s + p.tokens, 0);
    return tb - ta;
  });

  return {
    last24h: {
      requests: Number(totals?.requests ?? 0),
      tokens: Number(totals?.tokens ?? 0),
      errors: Number(totals?.errors ?? 0),
    },
    allTime: {
      requests: Number(allTime?.requests ?? 0),
      tokens: Number(allTime?.tokens ?? 0),
    },
    counts: {
      channels: Number(channelAll?.c ?? 0),
      channelsEnabled: Number(channelOn?.c ?? 0),
      tokens: Number(tokenAll?.c ?? 0),
      tokensEnabled: Number(tokenOn?.c ?? 0),
      models: Number(routeCount?.c ?? 0),
    },
    recent,
    byModel: byModel.map((r) => ({
      model: r.model ?? "(unknown)",
      requests: Number(r.requests),
      tokens: Number(r.tokens),
    })),
    grain,
    hourly: trend,
    trend,
    modelTrend,
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function alignLocalBucketMs(ms: number, grain: "hour" | "minute" | "day") {
  const d = new Date(ms);
  if (grain === "day") {
    d.setHours(0, 0, 0, 0);
  } else if (grain === "hour") {
    d.setMinutes(0, 0, 0);
  } else {
    d.setSeconds(0, 0);
  }
  return d.getTime();
}

function formatLocalBucket(ms: number, grain: "hour" | "minute" | "day") {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  if (grain === "day") return `${y}-${m}-${day}`;
  if (grain === "minute") return `${y}-${m}-${day} ${h}:${min}`;
  return `${y}-${m}-${day} ${h}:00`;
}

/** Fill every time slot in the window so empty periods show as zero bars. */
function fillTrendBuckets(
  grain: "hour" | "minute" | "day",
  sinceMs: number,
  raw: Array<{ hour: string; requests: number; tokens: number }>,
) {
  const map = new Map(raw.map((r) => [r.hour, r]));
  const stepMs =
    grain === "minute"
      ? 60 * 1000
      : grain === "day"
        ? 24 * 60 * 60 * 1000
        : 60 * 60 * 1000;
  const end = alignLocalBucketMs(Date.now(), grain);
  const start = end - sinceMs + stepMs;
  const out: Array<{ hour: string; requests: number; tokens: number }> = [];
  for (let t = start; t <= end; t += stepMs) {
    const key = formatLocalBucket(t, grain);
    const hit = map.get(key);
    out.push(
      hit ?? {
        hour: key,
        requests: 0,
        tokens: 0,
      },
    );
  }
  return out;
}

/** Estimated CNY per 1M tokens (until per-model pricing exists). */
export const USAGE_CNY_PER_1M_TOKENS = 2;

export function tokensToCny(tokens: number): number {
  return (Math.max(0, tokens) / 1_000_000) * USAGE_CNY_PER_1M_TOKENS;
}

const USAGE_PALETTE = [
  "#4f6ef7",
  "#7c5cfc",
  "#22c3a6",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#3b82f6",
];

function usageColorFor(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return USAGE_PALETTE[Math.abs(h) % USAGE_PALETTE.length]!;
}

function formatLocalDay(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function alignLocalDayMs(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type UsageGroupBy = "model" | "token";

/**
 * Usage analytics for 用量检测: summary cards + daily stacked series by model or API key.
 */
export async function getUsageAnalytics(opts?: {
  days?: number;
  groupBy?: UsageGroupBy;
}) {
  const days = Math.min(90, Math.max(1, opts?.days ?? 30));
  const groupBy: UsageGroupBy = opts?.groupBy === "token" ? "token" : "model";
  const end = alignLocalDayMs(Date.now());
  const start = end - (days - 1) * 24 * 60 * 60 * 1000;
  const since = new Date(start);

  const tokenRows = await db.select().from(tokens);
  const tokenLabel = new Map(
    tokenRows.map((t) => {
      const prefix = (t.keyPrefix || "").trim();
      const short = prefix
        ? `${prefix}${"*".repeat(Math.min(4, Math.max(0, 8 - prefix.length)))}`
        : t.id.slice(0, 8);
      return [t.id, `${t.name} ${short}`] as const;
    }),
  );

  const dimExpr =
    groupBy === "token"
      ? sql`coalesce(${requestLogs.tokenId}, '(unknown)')`
      : sql`coalesce(${requestLogs.model}, '(unknown)')`;

  const dayExpr = sql`strftime('%Y-%m-%d', ${requestLogs.createdAt} / 1000, 'unixepoch', 'localtime')`;

  const raw = await db
    .select({
      day: dayExpr,
      dim: dimExpr,
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.createdAt, since))
    .groupBy(dayExpr, dimExpr)
    .orderBy(dayExpr);

  type Seg = {
    id: string;
    label: string;
    color: string;
    requests: number;
    tokens: number;
    costCny: number;
  };

  const entityMap = new Map<string, Seg>();
  const dayMap = new Map<
    string,
    { date: string; requests: number; tokens: number; costCny: number; segments: Seg[] }
  >();

  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    const date = formatLocalDay(t);
    dayMap.set(date, {
      date,
      requests: 0,
      tokens: 0,
      costCny: 0,
      segments: [],
    });
  }

  for (const r of raw) {
    const date = String(r.day);
    const id = String(r.dim || "(unknown)");
    const requests = Number(r.requests) || 0;
    const tokens = Number(r.tokens) || 0;
    const costCny = tokensToCny(tokens);
    const label =
      groupBy === "token" ? tokenLabel.get(id) ?? (id === "(unknown)" ? "未绑定密钥" : id) : id;
    const color = usageColorFor(id);

    let ent = entityMap.get(id);
    if (!ent) {
      ent = { id, label, color, requests: 0, tokens: 0, costCny: 0 };
      entityMap.set(id, ent);
    }
    ent.requests += requests;
    ent.tokens += tokens;
    ent.costCny += costCny;

    let day = dayMap.get(date);
    if (!day) {
      day = { date, requests: 0, tokens: 0, costCny: 0, segments: [] };
      dayMap.set(date, day);
    }
    day.requests += requests;
    day.tokens += tokens;
    day.costCny += costCny;
    const existing = day.segments.find((s) => s.id === id);
    if (existing) {
      existing.requests += requests;
      existing.tokens += tokens;
      existing.costCny += costCny;
    } else {
      day.segments.push({ id, label, color, requests, tokens, costCny });
    }
  }

  const series = [...dayMap.values()].map((d) => ({
    ...d,
    costCny: Number(d.costCny.toFixed(4)),
    segments: d.segments
      .map((s) => ({ ...s, costCny: Number(s.costCny.toFixed(4)) }))
      .sort((a, b) => b.tokens - a.tokens),
  }));

  const entities = [...entityMap.values()]
    .map((e) => ({ ...e, costCny: Number(e.costCny.toFixed(4)) }))
    .sort((a, b) => b.tokens - a.tokens);

  const totalTokens = entities.reduce((s, e) => s + e.tokens, 0);
  const totalRequests = entities.reduce((s, e) => s + e.requests, 0);
  const totalCost = tokensToCny(totalTokens);

  return {
    days,
    groupBy,
    priceCnyPer1MTokens: USAGE_CNY_PER_1M_TOKENS,
    summary: {
      requests: totalRequests,
      tokens: totalTokens,
      costCny: Number(totalCost.toFixed(2)),
    },
    series,
    entities,
  };
}

export function maskSecret(value: string, keep = 4): string {
  if (!value || value.length <= keep * 2) return "****";
  return `${value.slice(0, keep)}****${value.slice(-keep)}`;
}

export function publicChannel(row: typeof channels.$inferSelect) {
  return {
    ...row,
    apiKey: maskSecret(row.apiKey),
    models: parseJsonArray(row.models),
  };
}

export function publicToken(row: typeof tokens.$inferSelect) {
  const remaining =
    row.quota < 0 ? -1 : Math.max(0, row.quota - (row.usedQuota ?? 0));
  return {
    id: row.id,
    userId: row.userId ?? null,
    name: row.name,
    keyPrefix: row.keyPrefix,
    key: row.keyPlain ?? null,
    quota: row.quota,
    usedQuota: row.usedQuota,
    remainingQuota: remaining,
    rateLimit: row.rateLimit,
    qps: row.rateLimit,
    concurrency: row.concurrency ?? 0,
    enabled: row.enabled,
    allowedModels: parseJsonArray(row.allowedModels),
    groupName: row.groupName ?? "",
    ipRules: parseIpRules(row.ipAllowlist ?? "[]"),
    ipAllowlist: parseIpRules(row.ipAllowlist ?? "[]")
      .filter((r) => r.action === "ALLOW")
      .map((r) => r.ip),
    routeIds: parseJsonArray(row.routeIds ?? "[]"),
    lastUsedAt: row.lastUsedAt ?? null,
    expiresAt: row.expiresAt,
    remark: row.remark,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
