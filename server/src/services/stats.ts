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
      ? sql`strftime('%Y-%m-%d %H:%M', ${requestLogs.createdAt} / 1000, 'unixepoch')`
      : grain === "day"
        ? sql`strftime('%Y-%m-%d', ${requestLogs.createdAt} / 1000, 'unixepoch')`
        : sql`strftime('%Y-%m-%d %H:00', ${requestLogs.createdAt} / 1000, 'unixepoch')`;

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

  const trend = trendRaw.map((r) => ({
    hour: String(r.bucket),
    requests: Number(r.requests),
    tokens: Number(r.tokens),
  }));

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
