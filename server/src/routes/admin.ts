import { Hono } from "hono";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  channels,
  modelRoutes,
  proxyRoutes,
  requestLogs,
  tokens,
} from "../db/schema.js";
import { requireAdmin } from "../middleware/auth.js";
import { config } from "../config.js";
import { safeEqual, generateApiKey, id, toJsonArray, parseJsonArray } from "../utils/crypto.js";
import { signAdminToken } from "../utils/jwt.js";
import { getDashboardStats, publicChannel, publicToken } from "../services/stats.js";

export const adminRoutes = new Hono();

adminRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username ?? "");
  const password = String(body.password ?? "");
  if (
    !safeEqual(username, config.adminUsername) ||
    !safeEqual(password, config.adminPassword)
  ) {
    return c.json({ error: "Invalid credentials" }, 401);
  }
  const token = signAdminToken(username);
  return c.json({ token, username });
});

adminRoutes.use("/*", requireAdmin);

adminRoutes.get("/me", (c) => c.json({ username: config.adminUsername, role: "admin" }));

adminRoutes.get("/dashboard", async (c) => {
  return c.json(await getDashboardStats());
});

// ---- Channels ----
adminRoutes.get("/channels", async (c) => {
  const rows = await db.select().from(channels).orderBy(desc(channels.priority));
  return c.json({ data: rows.map(publicChannel) });
});

adminRoutes.post("/channels", async (c) => {
  const schema = z.object({
    name: z.string().min(1),
    type: z.string().min(1).default("openai"),
    baseUrl: z.string().url(),
    apiKey: z.string().min(1),
    models: z.array(z.string()).default([]),
    weight: z.number().int().min(1).default(1),
    priority: z.number().int().default(0),
    enabled: z.boolean().default(true),
    timeoutMs: z.number().int().min(1000).default(120_000),
    remark: z.string().optional(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  const row = {
    id: id("ch"),
    name: v.name,
    type: v.type,
    baseUrl: v.baseUrl,
    apiKey: v.apiKey,
    models: toJsonArray(v.models),
    weight: v.weight,
    priority: v.priority,
    enabled: v.enabled,
    timeoutMs: v.timeoutMs,
    remark: v.remark ?? "",
  };
  await db.insert(channels).values(row);
  return c.json({ data: publicChannel({ ...row, createdAt: new Date(), updatedAt: new Date() }) }, 201);
});

adminRoutes.put("/channels/:id", async (c) => {
  const idParam = c.req.param("id");
  const existing = await db.query.channels.findFirst({ where: eq(channels.id, idParam) });
  if (!existing) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json();
  const patch: Partial<typeof channels.$inferInsert> = { updatedAt: new Date() };
  if (body.name != null) patch.name = String(body.name);
  if (body.type != null) patch.type = String(body.type);
  if (body.baseUrl != null) patch.baseUrl = String(body.baseUrl);
  if (body.apiKey != null && body.apiKey !== "" && !String(body.apiKey).includes("****")) {
    patch.apiKey = String(body.apiKey);
  }
  if (body.models != null) patch.models = toJsonArray(body.models);
  if (body.weight != null) patch.weight = Number(body.weight);
  if (body.priority != null) patch.priority = Number(body.priority);
  if (body.enabled != null) patch.enabled = Boolean(body.enabled);
  if (body.timeoutMs != null) patch.timeoutMs = Number(body.timeoutMs);
  if (body.remark != null) patch.remark = String(body.remark);
  await db.update(channels).set(patch).where(eq(channels.id, idParam));
  const row = await db.query.channels.findFirst({ where: eq(channels.id, idParam) });
  return c.json({ data: publicChannel(row!) });
});

adminRoutes.delete("/channels/:id", async (c) => {
  await db.delete(channels).where(eq(channels.id, c.req.param("id")));
  return c.json({ ok: true });
});

adminRoutes.post("/channels/:id/test", async (c) => {
  const idParam = c.req.param("id");
  const row = await db.query.channels.findFirst({ where: eq(channels.id, idParam) });
  if (!row) return c.json({ error: "Not found" }, 404);

  const started = Date.now();
  const base = row.baseUrl.replace(/\/+$/, "");
  const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(row.timeoutMs, 20_000));
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${row.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    const text = await res.text();
    return c.json({
      ok: res.ok,
      statusCode: res.status,
      latencyMs,
      preview: text.slice(0, 200),
      url,
    });
  } catch (err) {
    return c.json({
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      url,
    });
  }
});

adminRoutes.get("/system", (c) => {
  return c.json({
    name: "StarConverge",
    version: "0.2.0",
    adminUsername: config.adminUsername,
    endpoints: {
      openai: "/v1",
      chat: "/v1/chat/completions",
      models: "/v1/models",
      proxy: "/proxy",
      health: "/health",
    },
    tips: [
      "客户端 Base URL 填：https://你的域名 或 http://IP:8787/v1",
      "Authorization: Bearer <访问密钥>",
      "通道测试会请求上游 /v1/models",
    ],
  });
});

// ---- Tokens ----
adminRoutes.get("/tokens", async (c) => {
  const rows = await db.select().from(tokens).orderBy(desc(tokens.createdAt));
  return c.json({ data: rows.map(publicToken) });
});

adminRoutes.post("/tokens", async (c) => {
  const schema = z.object({
    name: z.string().min(1),
    quota: z.number().int().default(-1),
    rateLimit: z.number().int().min(0).default(60),
    allowedModels: z.array(z.string()).default([]),
    expiresAt: z.number().nullable().optional(),
    remark: z.string().optional(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  const key = generateApiKey();
  const row = {
    id: id("tk"),
    name: v.name,
    keyHash: key.hash,
    keyPrefix: key.prefix,
    keyPlain: key.key,
    quota: v.quota,
    usedQuota: 0,
    rateLimit: v.rateLimit,
    enabled: true,
    allowedModels: toJsonArray(v.allowedModels),
    expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
    remark: v.remark ?? "",
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

adminRoutes.get("/available-models", async (c) => {
  const set = new Set<string>();
  const chRows = await db.select().from(channels);
  for (const ch of chRows) {
    for (const m of parseJsonArray(ch.models)) {
      if (m && m !== "*") set.add(m);
    }
  }
  const mrRows = await db.select().from(modelRoutes);
  for (const mr of mrRows) {
    if (mr.model) set.add(mr.model);
    if (mr.rewriteModel) set.add(mr.rewriteModel);
  }
  return c.json({ data: ["*", ...[...set].sort()] });
});

adminRoutes.put("/tokens/:id", async (c) => {
  const idParam = c.req.param("id");
  const existing = await db.query.tokens.findFirst({ where: eq(tokens.id, idParam) });
  if (!existing) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json();
  const patch: Partial<typeof tokens.$inferInsert> = { updatedAt: new Date() };
  if (body.name != null) patch.name = String(body.name);
  if (body.quota != null) patch.quota = Number(body.quota);
  if (body.usedQuota != null) patch.usedQuota = Number(body.usedQuota);
  if (body.rateLimit != null) patch.rateLimit = Number(body.rateLimit);
  if (body.enabled != null) patch.enabled = Boolean(body.enabled);
  if (body.allowedModels != null) patch.allowedModels = toJsonArray(body.allowedModels);
  if (body.expiresAt !== undefined) {
    patch.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  }
  if (body.remark != null) patch.remark = String(body.remark);
  await db.update(tokens).set(patch).where(eq(tokens.id, idParam));
  const row = await db.query.tokens.findFirst({ where: eq(tokens.id, idParam) });
  return c.json({ data: publicToken(row!) });
});

adminRoutes.delete("/tokens/:id", async (c) => {
  await db.delete(tokens).where(eq(tokens.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---- Model routes ----
adminRoutes.get("/models", async (c) => {
  const rows = await db.select().from(modelRoutes).orderBy(modelRoutes.model);
  return c.json({
    data: rows.map((r) => ({
      ...r,
      channelIds: parseJsonArray(r.channelIds),
    })),
  });
});

adminRoutes.post("/models", async (c) => {
  const schema = z.object({
    model: z.string().min(1),
    channelIds: z.array(z.string()).default([]),
    rewriteModel: z.string().nullable().optional(),
    enabled: z.boolean().default(true),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  const row = {
    id: id("mr"),
    model: v.model,
    channelIds: toJsonArray(v.channelIds),
    rewriteModel: v.rewriteModel ?? null,
    enabled: v.enabled,
  };
  await db.insert(modelRoutes).values(row);
  return c.json({ data: { ...row, channelIds: v.channelIds, createdAt: new Date(), updatedAt: new Date() } }, 201);
});

adminRoutes.put("/models/:id", async (c) => {
  const idParam = c.req.param("id");
  const body = await c.req.json();
  const patch: Partial<typeof modelRoutes.$inferInsert> = { updatedAt: new Date() };
  if (body.model != null) patch.model = String(body.model);
  if (body.channelIds != null) patch.channelIds = toJsonArray(body.channelIds);
  if (body.rewriteModel !== undefined) patch.rewriteModel = body.rewriteModel || null;
  if (body.enabled != null) patch.enabled = Boolean(body.enabled);
  await db.update(modelRoutes).set(patch).where(eq(modelRoutes.id, idParam));
  const row = await db.query.modelRoutes.findFirst({ where: eq(modelRoutes.id, idParam) });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: { ...row, channelIds: parseJsonArray(row.channelIds) } });
});

adminRoutes.delete("/models/:id", async (c) => {
  await db.delete(modelRoutes).where(eq(modelRoutes.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---- Proxy routes ----
adminRoutes.get("/proxy-routes", async (c) => {
  const rows = await db.select().from(proxyRoutes).orderBy(proxyRoutes.pathPrefix);
  return c.json({
    data: rows.map((r) => ({
      ...r,
      authHeader: r.authHeader ? "****" : null,
    })),
  });
});

adminRoutes.post("/proxy-routes", async (c) => {
  const schema = z.object({
    name: z.string().min(1),
    pathPrefix: z.string().min(1),
    targetUrl: z.string().url(),
    authHeader: z.string().nullable().optional(),
    stripPrefix: z.boolean().default(true),
    enabled: z.boolean().default(true),
    requireToken: z.boolean().default(true),
    timeoutMs: z.number().int().default(30_000),
    remark: z.string().optional(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  const prefix = v.pathPrefix.startsWith("/") ? v.pathPrefix : `/${v.pathPrefix}`;
  const row = {
    id: id("pr"),
    name: v.name,
    pathPrefix: prefix,
    targetUrl: v.targetUrl,
    authHeader: v.authHeader ?? null,
    stripPrefix: v.stripPrefix,
    enabled: v.enabled,
    requireToken: v.requireToken,
    timeoutMs: v.timeoutMs,
    remark: v.remark ?? "",
  };
  await db.insert(proxyRoutes).values(row);
  return c.json({ data: { ...row, createdAt: new Date(), updatedAt: new Date(), authHeader: row.authHeader ? "****" : null } }, 201);
});

adminRoutes.put("/proxy-routes/:id", async (c) => {
  const idParam = c.req.param("id");
  const body = await c.req.json();
  const patch: Partial<typeof proxyRoutes.$inferInsert> = { updatedAt: new Date() };
  if (body.name != null) patch.name = String(body.name);
  if (body.pathPrefix != null) {
    const p = String(body.pathPrefix);
    patch.pathPrefix = p.startsWith("/") ? p : `/${p}`;
  }
  if (body.targetUrl != null) patch.targetUrl = String(body.targetUrl);
  if (body.authHeader != null && !String(body.authHeader).includes("****")) {
    patch.authHeader = body.authHeader || null;
  }
  if (body.stripPrefix != null) patch.stripPrefix = Boolean(body.stripPrefix);
  if (body.enabled != null) patch.enabled = Boolean(body.enabled);
  if (body.requireToken != null) patch.requireToken = Boolean(body.requireToken);
  if (body.timeoutMs != null) patch.timeoutMs = Number(body.timeoutMs);
  if (body.remark != null) patch.remark = String(body.remark);
  await db.update(proxyRoutes).set(patch).where(eq(proxyRoutes.id, idParam));
  const row = await db.query.proxyRoutes.findFirst({ where: eq(proxyRoutes.id, idParam) });
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ data: { ...row, authHeader: row.authHeader ? "****" : null } });
});

adminRoutes.delete("/proxy-routes/:id", async (c) => {
  await db.delete(proxyRoutes).where(eq(proxyRoutes.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---- Logs ----
adminRoutes.get("/logs", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const model = c.req.query("model");
  const tokenId = c.req.query("tokenId");
  const sinceHours = Number(c.req.query("sinceHours") ?? 0);

  const conditions = [];
  if (model) conditions.push(eq(requestLogs.model, model));
  if (tokenId) conditions.push(eq(requestLogs.tokenId, tokenId));
  if (sinceHours > 0) {
    conditions.push(gte(requestLogs.createdAt, new Date(Date.now() - sinceHours * 3600_000)));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(requestLogs)
    .where(where)
    .orderBy(desc(requestLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(requestLogs)
    .where(where);

  return c.json({ data: rows, total: Number(count) });
});
