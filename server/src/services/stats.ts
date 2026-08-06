import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels, modelRoutes, requestLogs, tokens } from "../db/schema.js";
import { id, parseJsonArray } from "../utils/crypto.js";

export async function writeLog(input: {
  tokenId?: string | null;
  channelId?: string | null;
  model?: string | null;
  path: string;
  method: string;
  statusCode?: number | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number | null;
  ip?: string | null;
  error?: string | null;
}) {
  await db.insert(requestLogs).values({
    id: id("log"),
    tokenId: input.tokenId ?? null,
    channelId: input.channelId ?? null,
    model: input.model ?? null,
    path: input.path,
    method: input.method,
    statusCode: input.statusCode ?? null,
    promptTokens: input.promptTokens ?? 0,
    completionTokens: input.completionTokens ?? 0,
    totalTokens: input.totalTokens ?? 0,
    durationMs: input.durationMs ?? null,
    ip: input.ip ?? null,
    error: input.error ?? null,
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

export async function getDashboardStats() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
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

  const channelCount = await db
    .select({ c: sql<number>`count(*)` })
    .from(channels)
    .where(eq(channels.enabled, true));
  const tokenCount = await db
    .select({ c: sql<number>`count(*)` })
    .from(tokens)
    .where(eq(tokens.enabled, true));
  const routeCount = await db
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
      channels: Number(channelCount[0]?.c ?? 0),
      tokens: Number(tokenCount[0]?.c ?? 0),
      models: Number(routeCount[0]?.c ?? 0),
    },
    recent,
    byModel: byModel.map((r) => ({
      model: r.model ?? "(unknown)",
      requests: Number(r.requests),
      tokens: Number(r.tokens),
    })),
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
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    quota: row.quota,
    usedQuota: row.usedQuota,
    rateLimit: row.rateLimit,
    enabled: row.enabled,
    allowedModels: parseJsonArray(row.allowedModels),
    expiresAt: row.expiresAt,
    remark: row.remark,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
