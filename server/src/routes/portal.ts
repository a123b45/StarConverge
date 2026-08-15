import { Hono } from "hono";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  channels,
  modelRoutes,
  requestLogs,
  tokens,
  users,
} from "../db/schema.js";
import { requireUser, type SessionVars } from "../middleware/auth.js";
import {
  generateApiKey,
  hashPassword,
  id,
  parseJsonArray,
  toJsonArray,
} from "../utils/crypto.js";
import { publicToken } from "../services/stats.js";
import { resolveChannelModelIds } from "../services/upstream-models.js";

export const portalRoutes = new Hono<SessionVars>();

portalRoutes.use("/*", requireUser);

portalRoutes.get("/me", async (c) => {
  const auth = c.get("auth");
  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.userId!),
  });
  if (!user) return c.json({ error: "Not found" }, 404);
  const userTokens = await db
    .select()
    .from(tokens)
    .where(eq(tokens.userId, user.id));
  let usedQuota = 0;
  let quota = 0;
  let unlimited = false;
  for (const t of userTokens) {
    usedQuota += t.usedQuota;
    if (t.quota < 0) unlimited = true;
    else quota += t.quota;
  }
  return c.json({
    username: user.username,
    displayName: user.displayName,
    role: "user",
    quota: unlimited ? -1 : quota,
    usedQuota,
    tokenCount: userTokens.length,
  });
});

portalRoutes.patch("/me", async (c) => {
  const auth = c.get("auth");
  const schema = z.object({
    displayName: z.string().max(64).optional(),
    password: z.string().min(6).max(128).optional(),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "参数无效" }, 400);
  }
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.displayName != null) {
    patch.displayName = parsed.data.displayName.trim() || null;
  }
  if (parsed.data.password) {
    patch.passwordHash = hashPassword(parsed.data.password);
  }
  if (Object.keys(patch).length <= 1) {
    return c.json({ error: "没有可更新的字段" }, 400);
  }
  await db.update(users).set(patch).where(eq(users.id, auth.userId!));
  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.userId!),
  });
  return c.json({
    username: user!.username,
    displayName: user!.displayName,
    role: "user" as const,
  });
});

portalRoutes.get("/models", async (c) => {
  const auth = c.get("auth");
  const routes = await db
    .select()
    .from(modelRoutes)
    .where(eq(modelRoutes.enabled, true));
  const chRows = await db.select().from(channels);
  const chMap = new Map(chRows.map((ch) => [ch.id, ch]));

  type ModelRow = {
    id: string;
    model: string;
    rewriteModel: string | null;
    providers: { id: string; name: string; type: string }[];
    providerLabel: string;
    enabled: boolean;
  };
  const data: ModelRow[] = routes.map((r) => {
    const channelIds = parseJsonArray(r.channelIds);
    const providers = channelIds
      .map((cid) => chMap.get(cid))
      .filter((ch): ch is NonNullable<typeof ch> => !!ch && ch.enabled)
      .map((ch) => ({ id: ch.id, name: ch.name, type: ch.type }));
    return {
      id: r.id,
      model: r.model,
      rewriteModel: r.rewriteModel,
      providers,
      providerLabel: providers.map((p) => p.name).join(" / ") || "—",
      enabled: r.enabled,
    };
  });

  // Surface channel models (including upstream-fetched for unrestricted channels)
  const routed = new Set(data.map((d) => d.model));
  for (const ch of chRows) {
    if (!ch.enabled) continue;
    const modelIds = await resolveChannelModelIds(ch);
    for (const m of modelIds) {
      if (!m || m === "*" || routed.has(m)) continue;
      routed.add(m);
      data.push({
        id: `chmodel_${ch.id}_${m}`,
        model: m,
        rewriteModel: null,
        providers: [{ id: ch.id, name: ch.name, type: ch.type }],
        providerLabel: ch.name,
        enabled: true,
      });
    }
  }

  // Filter by union of this user's API key allowedModels (empty = all)
  const userTokens = await db
    .select({ allowedModels: tokens.allowedModels, enabled: tokens.enabled })
    .from(tokens)
    .where(eq(tokens.userId, auth.userId!));
  const allowSets = userTokens
    .filter((t) => t.enabled)
    .map((t) => parseJsonArray(t.allowedModels));
  const hasAnyKey = allowSets.length > 0;
  const unrestrictedKey = allowSets.some((a) => a.length === 0);
  let filtered = data;
  if (hasAnyKey && !unrestrictedKey) {
    const allow = new Set(allowSets.flat());
    filtered = data.filter((d) => allow.has(d.model));
  } else if (!hasAnyKey) {
    // No keys yet — still show catalog so user knows what's available
    filtered = data;
  }

  filtered.sort((a, b) => a.model.localeCompare(b.model));
  return c.json({ data: filtered, total: filtered.length });
});

portalRoutes.get("/keys", async (c) => {
  const auth = c.get("auth");
  const rows = await db
    .select()
    .from(tokens)
    .where(eq(tokens.userId, auth.userId!))
    .orderBy(desc(tokens.createdAt));
  return c.json({
    data: rows.map((r) => ({
      ...publicToken(r),
      key: r.keyPlain
        ? `${r.keyPrefix}${"•".repeat(12)}${r.keyPlain.slice(-4)}`
        : `${r.keyPrefix}••••`,
      keyMasked: true,
    })),
  });
});

portalRoutes.post("/keys", async (c) => {
  const auth = c.get("auth");
  const schema = z.object({
    name: z.string().min(1).max(64),
    quota: z.number().int().default(1_000_000),
    rateLimit: z.number().int().min(0).default(60),
    allowedModels: z.array(z.string()).default([]),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  const key = generateApiKey();
  const row = {
    id: id("tk"),
    userId: auth.userId!,
    name: v.name,
    keyHash: key.hash,
    keyPrefix: key.prefix,
    keyPlain: key.key,
    quota: v.quota,
    usedQuota: 0,
    rateLimit: v.rateLimit,
    concurrency: 0,
    enabled: true,
    allowedModels: toJsonArray(v.allowedModels),
    groupName: "",
    ipAllowlist: "[]",
    routeIds: "[]",
    lastUsedAt: null,
    expiresAt: null,
    remark: "",
  };
  await db.insert(tokens).values(row);
  return c.json(
    {
      data: publicToken({ ...row, createdAt: new Date(), updatedAt: new Date() }),
      key: key.key,
    },
    201,
  );
});

portalRoutes.get("/keys/:id", async (c) => {
  const auth = c.get("auth");
  const row = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, c.req.param("id")), eq(tokens.userId, auth.userId!)),
  });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: publicToken(row), key: row.keyPlain });
});

portalRoutes.delete("/keys/:id", async (c) => {
  const auth = c.get("auth");
  const row = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, c.req.param("id")), eq(tokens.userId, auth.userId!)),
  });
  if (!row) return c.json({ error: "Not found" }, 404);
  await db.delete(tokens).where(eq(tokens.id, row.id));
  return c.json({ ok: true });
});

portalRoutes.get("/usage", async (c) => {
  const auth = c.get("auth");
  const from = Number(c.req.query("from") ?? Date.now() - 7 * 86400_000);
  const modelFilter = c.req.query("model");

  const userTokens = await db
    .select()
    .from(tokens)
    .where(eq(tokens.userId, auth.userId!));
  const tokenIds = userTokens.map((t) => t.id);

  let usedQuota = 0;
  let quota = 0;
  let unlimited = false;
  for (const t of userTokens) {
    usedQuota += t.usedQuota;
    if (t.quota < 0) unlimited = true;
    else quota += t.quota;
  }

  if (tokenIds.length === 0) {
    return c.json({
      summary: {
        quota: unlimited ? -1 : quota,
        usedQuota,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        p50Ms: 0,
        p95Ms: 0,
        successCalls: 0,
        errorCalls: 0,
        avgMs: 0,
      },
      byModel: [],
      daily: [],
    });
  }

  const conditions = [
    inArray(requestLogs.tokenId, tokenIds),
    gte(requestLogs.createdAt, new Date(from)),
  ];
  if (modelFilter) conditions.push(eq(requestLogs.model, modelFilter));

  const logs = await db
    .select()
    .from(requestLogs)
    .where(and(...conditions));

  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let successCalls = 0;
  let errorCalls = 0;
  const durations: number[] = [];
  const byModelMap = new Map<
    string,
    {
      model: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      durations: number[];
    }
  >();
  const dailyMap = new Map<
    string,
    {
      date: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }
  >();

  for (const log of logs) {
    const pt = log.promptTokens ?? 0;
    const ct = log.completionTokens ?? 0;
    const tt = log.totalTokens ?? pt + ct;
    promptTokens += pt;
    completionTokens += ct;
    totalTokens += tt;
    const code = log.statusCode ?? 0;
    if (code >= 200 && code < 400) successCalls += 1;
    else errorCalls += 1;
    if (log.durationMs != null) durations.push(log.durationMs);
    const m = log.model || "unknown";
    const entry = byModelMap.get(m) ?? {
      model: m,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durations: [] as number[],
    };
    entry.calls += 1;
    entry.promptTokens += pt;
    entry.completionTokens += ct;
    entry.totalTokens += tt;
    if (log.durationMs != null) entry.durations.push(log.durationMs);
    byModelMap.set(m, entry);

    const day = new Date(log.createdAt).toISOString().slice(0, 10);
    const d = dailyMap.get(day) ?? {
      date: day,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    d.calls += 1;
    d.promptTokens += pt;
    d.completionTokens += ct;
    d.totalTokens += tt;
    dailyMap.set(day, d);
  }

  const pct = (arr: number[], p: number) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(
      sorted.length - 1,
      Math.floor((p / 100) * sorted.length),
    );
    return sorted[idx];
  };

  const byModel = [...byModelMap.values()].map((e) => ({
    model: e.model,
    calls: e.calls,
    promptTokens: e.promptTokens,
    completionTokens: e.completionTokens,
    totalTokens: e.totalTokens,
    share: logs.length ? Math.round((e.calls / logs.length) * 1000) / 10 : 0,
    p50Ms: pct(e.durations, 50),
    p95Ms: pct(e.durations, 95),
  }));

  const daily = [...dailyMap.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const avgMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return c.json({
    summary: {
      quota: unlimited ? -1 : quota,
      usedQuota,
      calls: logs.length,
      promptTokens,
      completionTokens,
      totalTokens,
      p50Ms: pct(durations, 50),
      p95Ms: pct(durations, 95),
      successCalls,
      errorCalls,
      avgMs,
    },
    byModel,
    daily,
  });
});

portalRoutes.get("/usage/requests", async (c) => {
  const auth = c.get("auth");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const from = Number(c.req.query("from") ?? Date.now() - 30 * 86400_000);
  const modelFilter = c.req.query("model");

  const userTokens = await db
    .select({ id: tokens.id })
    .from(tokens)
    .where(eq(tokens.userId, auth.userId!));
  const tokenIds = userTokens.map((t) => t.id);
  if (tokenIds.length === 0) {
    return c.json({ data: [], page, pageSize, total: 0, totalPages: 1 });
  }

  const conditions = [
    inArray(requestLogs.tokenId, tokenIds),
    gte(requestLogs.createdAt, new Date(from)),
  ];
  if (modelFilter) conditions.push(eq(requestLogs.model, modelFilter));

  const where = and(...conditions);
  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(requestLogs)
    .where(where);
  const total = Number(countRow[0]?.count ?? 0);
  const rows = await db
    .select()
    .from(requestLogs)
    .where(where)
    .orderBy(desc(requestLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      model: r.model,
      path: r.path,
      promptTokens: r.promptTokens ?? 0,
      completionTokens: r.completionTokens ?? 0,
      totalTokens: r.totalTokens ?? 0,
      durationMs: r.durationMs,
      statusCode: r.statusCode,
      ok: (r.statusCode ?? 0) >= 200 && (r.statusCode ?? 0) < 400,
      createdAt: r.createdAt,
      error: r.error,
      requestPreview: r.requestPreview,
      responsePreview: r.responsePreview,
      messageCount: r.messageCount ?? 0,
      channelId: r.channelId,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

portalRoutes.get("/usage/requests/:id", async (c) => {
  const auth = c.get("auth");
  const userTokens = await db
    .select({ id: tokens.id })
    .from(tokens)
    .where(eq(tokens.userId, auth.userId!));
  const tokenIds = userTokens.map((t) => t.id);
  if (!tokenIds.length) return c.json({ error: "Not found" }, 404);

  const row = await db.query.requestLogs.findFirst({
    where: and(
      eq(requestLogs.id, c.req.param("id")),
      inArray(requestLogs.tokenId, tokenIds),
    ),
  });
  if (!row) return c.json({ error: "Not found" }, 404);

  let channelName: string | null = null;
  if (row.channelId) {
    const ch = await db.query.channels.findFirst({
      where: eq(channels.id, row.channelId),
    });
    channelName = ch?.name ?? null;
  }

  return c.json({
    data: {
      id: row.id,
      model: row.model,
      path: row.path,
      method: row.method,
      promptTokens: row.promptTokens ?? 0,
      completionTokens: row.completionTokens ?? 0,
      totalTokens: row.totalTokens ?? 0,
      durationMs: row.durationMs,
      statusCode: row.statusCode,
      ok: (row.statusCode ?? 0) >= 200 && (row.statusCode ?? 0) < 400,
      createdAt: row.createdAt,
      error: row.error,
      requestPreview: row.requestPreview,
      responsePreview: row.responsePreview,
      messageCount: row.messageCount ?? 0,
      channelId: row.channelId,
      channelName,
      ip: row.ip,
    },
  });
});
