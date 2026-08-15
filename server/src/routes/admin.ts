import { Hono } from "hono";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  channels,
  modelRoutes,
  proxyRoutes,
  requestLogs,
  roles,
  tokens,
  users,
} from "../db/schema.js";
import { hasApiPerm, requireAdmin, type AdminVars } from "../middleware/auth.js";
import { config } from "../config.js";
import {
  safeEqual,
  generateApiKey,
  id,
  toJsonArray,
  parseJsonArray,
  hashPassword,
} from "../utils/crypto.js";
import { signToken } from "../utils/jwt.js";
import { getDashboardStats, publicChannel, publicToken } from "../services/stats.js";
import {
  explicitChannelModels,
  fetchUpstreamModels,
  isUnrestrictedModels,
  modelsUrl,
} from "../services/upstream-models.js";
import {
  parseIpRules,
  serializeIpRules,
  type IpRule,
} from "../utils/ip-allow.js";

const ipRuleSchema = z.object({
  name: z.string().optional(),
  ip: z.string().min(1),
  action: z.enum(["ALLOW", "DENY"]).default("ALLOW"),
});

function bodyToIpRules(body: {
  ipRules?: unknown;
  ipAllowlist?: unknown;
}): IpRule[] | null {
  if (body.ipRules != null) {
    return parseIpRules(
      Array.isArray(body.ipRules) ? body.ipRules : String(body.ipRules),
    );
  }
  if (body.ipAllowlist != null) {
    if (Array.isArray(body.ipAllowlist)) return parseIpRules(body.ipAllowlist);
    return parseIpRules(String(body.ipAllowlist));
  }
  return null;
}

/** Remove channel from all model_routes; delete routes left with no channels. */
async function detachChannelFromModelRoutes(channelId: string) {
  const rows = await db.select().from(modelRoutes);
  for (const r of rows) {
    const ids = parseJsonArray(r.channelIds).filter((cid) => cid !== channelId);
    if (ids.length === 0) {
      await db.delete(modelRoutes).where(eq(modelRoutes.id, r.id));
    } else if (ids.length !== parseJsonArray(r.channelIds).length) {
      await db
        .update(modelRoutes)
        .set({ channelIds: toJsonArray(ids), updatedAt: new Date() })
        .where(eq(modelRoutes.id, r.id));
    }
  }
  await pruneOrphanModelRoutes();
}

/** Keep model_routes in sync with this channel's model list; drop orphan routes. */
async function syncChannelModelRoutes(channelId: string, models: string[]) {
  const keep = new Set(models.filter((m) => m && m !== "*"));
  const rows = await db.select().from(modelRoutes);

  for (const r of rows) {
    const ids = parseJsonArray(r.channelIds);
    const has = ids.includes(channelId);
    if (keep.has(r.model)) {
      if (!has) {
        await db
          .update(modelRoutes)
          .set({
            channelIds: toJsonArray([...ids, channelId]),
            enabled: true,
            updatedAt: new Date(),
          })
          .where(eq(modelRoutes.id, r.id));
      }
    } else if (has) {
      const next = ids.filter((cid) => cid !== channelId);
      if (next.length === 0) {
        await db.delete(modelRoutes).where(eq(modelRoutes.id, r.id));
      } else {
        await db
          .update(modelRoutes)
          .set({ channelIds: toJsonArray(next), updatedAt: new Date() })
          .where(eq(modelRoutes.id, r.id));
      }
    }
  }

  const existingModels = new Set(
    (await db.select().from(modelRoutes)).map((r) => r.model),
  );
  for (const m of keep) {
    if (existingModels.has(m)) continue;
    await db.insert(modelRoutes).values({
      id: id("mr"),
      model: m,
      channelIds: toJsonArray([channelId]),
      rewriteModel: null,
      enabled: true,
      published: false,
    });
  }
  await pruneOrphanModelRoutes();
}

/** Drop routes with no channels, or models not listed on any channel. */
async function pruneOrphanModelRoutes() {
  const chRows = await db.select().from(channels);
  const catalog = new Set<string>();
  for (const ch of chRows) {
    for (const m of explicitChannelModels(ch.models)) catalog.add(m);
  }
  const routes = await db.select().from(modelRoutes);
  for (const r of routes) {
    const ids = parseJsonArray(r.channelIds);
    if (!ids.length || !catalog.has(r.model)) {
      await db.delete(modelRoutes).where(eq(modelRoutes.id, r.id));
    }
  }
}
import {
  getRoleById,
  publicRole,
} from "../services/roles.js";
import {
  API_GROUPS,
  FIXED_ROLE_KEYS,
  MENU_GROUPS,
} from "../rbac/permissions.js";

export const adminRoutes = new Hono<AdminVars>();

adminRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username ?? "");
  const password = String(body.password ?? "");
  if (
    !safeEqual(username, config.adminUsername) ||
    !safeEqual(password, config.adminPassword)
  ) {
    return c.json({ error: "用户名或密码错误" }, 401);
  }
  const token = signToken(username, "admin");
  return c.json({ token, username, role: "admin", redirect: "/admin" });
});

adminRoutes.use("/*", requireAdmin);

adminRoutes.get("/me", (c) => {
  const auth = c.get("adminAuth");
  return c.json({
    username: auth.username,
    role: "admin",
    roleName: auth.roleName ?? (auth.isSuper ? "超级管理员" : "管理员"),
    userId: auth.userId ?? null,
    isSuper: auth.isSuper,
    menuPerms: auth.menuPerms,
    apiPerms: auth.apiPerms,
  });
});

adminRoutes.get("/permissions/catalog", (c) => {
  return c.json({ menuGroups: MENU_GROUPS, apiGroups: API_GROUPS });
});

adminRoutes.get("/dashboard", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.dashboard.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  return c.json(await getDashboardStats());
});

// ---- Roles ----
adminRoutes.get("/roles", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.roles.read", "api.users.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  const rows = await db.select().from(roles).orderBy(desc(roles.createdAt));
  const fixed = rows.filter((r) => r.key === "admin" || r.key === "portal_user");
  // Stable order: 管理员 first, then 用户
  fixed.sort((a, b) => (a.key === "admin" ? -1 : b.key === "admin" ? 1 : 0));
  return c.json({ data: fixed.map(publicRole) });
});

adminRoutes.post("/roles", async (c) => {
  return c.json({ error: "系统仅保留「管理员」与「用户」两种角色，不可新建" }, 400);
});

adminRoutes.put("/roles/:id", async (c) => {
  return c.json({ error: "角色权限已固定，不可编辑" }, 400);
});

adminRoutes.delete("/roles/:id", async (c) => {
  return c.json({ error: "系统角色不可删除" }, 400);
});

adminRoutes.get("/roles/:id/users", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.roles.read", "api.users.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  const roleId = c.req.param("id");
  const existing = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!existing) return c.json({ error: "Not found" }, 404);
  const bound = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.roleId, roleId));
  return c.json({
    data: bound.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      label: (u.displayName || "").trim() || u.username,
    })),
  });
});

// ---- Users ----
adminRoutes.get("/users", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.users.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  const data = [];
  for (const u of rows) {
    const tks = await db.select().from(tokens).where(eq(tokens.userId, u.id));
    let usedQuota = 0;
    let quota = 0;
    let unlimited = false;
    for (const t of tks) {
      usedQuota += t.usedQuota;
      if (t.quota < 0) unlimited = true;
      else quota += t.quota;
    }
    const role = await getRoleById(u.roleId);
    data.push({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      enabled: u.enabled,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      tokenCount: tks.length,
      quota: unlimited ? -1 : quota,
      usedQuota,
      roleId: u.roleId,
      roleName: role?.name ?? u.role,
      roleKey: role?.key ?? null,
    });
  }
  return c.json({ data });
});

adminRoutes.post("/users", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.users.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const schema = z.object({
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(6).max(128),
    displayName: z.string().max(64).optional(),
    email: z.string().email().max(128).optional().nullable(),
    roleId: z.string().min(1),
    enabled: z.boolean().default(true),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  if (safeEqual(v.username, config.adminUsername)) {
    return c.json({ error: "Username reserved" }, 409);
  }
  const role = await getRoleById(v.roleId);
  if (!role) return c.json({ error: "角色不存在" }, 400);
  if (!(FIXED_ROLE_KEYS as readonly string[]).includes(role.key)) {
    return c.json({ error: "只能选择「管理员」或「用户」" }, 400);
  }
  const emailNorm = v.email?.toLowerCase() || null;
  const existing = await db.query.users.findFirst({
    where: emailNorm
      ? or(eq(users.username, v.username), eq(users.email, emailNorm))
      : eq(users.username, v.username),
  });
  if (existing) return c.json({ error: "用户名或邮箱已被占用" }, 409);
  const row = {
    id: id("usr"),
    username: v.username,
    passwordHash: hashPassword(v.password),
    displayName: v.displayName?.trim() || v.username,
    email: emailNorm,
    role: role.name,
    roleId: role.id,
    enabled: v.enabled,
  };
  await db.insert(users).values(row);
  return c.json(
    {
      data: {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        email: row.email,
        enabled: row.enabled,
        roleId: row.roleId,
        roleName: role.name,
        createdAt: new Date(),
        tokenCount: 0,
        quota: 0,
        usedQuota: 0,
      },
    },
    201,
  );
});

adminRoutes.patch("/users/:id", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.users.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const idParam = c.req.param("id");
  const existing = await db.query.users.findFirst({ where: eq(users.id, idParam) });
  if (!existing) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json();
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (body.displayName != null) patch.displayName = String(body.displayName);
  if (body.email != null) {
    patch.email = String(body.email).trim().toLowerCase() || null;
  }
  if (body.enabled != null) patch.enabled = Boolean(body.enabled);
  if (body.password != null && String(body.password).length >= 6) {
    patch.passwordHash = hashPassword(String(body.password));
  }
  if (body.roleId != null) {
    const role = await getRoleById(String(body.roleId));
    if (!role) return c.json({ error: "角色不存在" }, 400);
    if (!(FIXED_ROLE_KEYS as readonly string[]).includes(role.key)) {
      return c.json({ error: "只能选择「管理员」或「用户」" }, 400);
    }
    patch.roleId = role.id;
    patch.role = role.name;
  }
  await db.update(users).set(patch).where(eq(users.id, idParam));
  const row = await db.query.users.findFirst({ where: eq(users.id, idParam) });
  const role = await getRoleById(row!.roleId);
  return c.json({
    data: {
      id: row!.id,
      username: row!.username,
      displayName: row!.displayName,
      email: row!.email,
      enabled: row!.enabled,
      roleId: row!.roleId,
      roleName: role?.name ?? row!.role,
      createdAt: row!.createdAt,
    },
  });
});

adminRoutes.delete("/users/:id", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.users.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const idParam = c.req.param("id");
  await db.delete(tokens).where(eq(tokens.userId, idParam));
  await db.delete(users).where(eq(users.id, idParam));
  return c.json({ ok: true });
});

// ---- Channels ----
adminRoutes.get("/channels", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.channels.read")) {
    return c.json({ error: "无权限" }, 403);
  }
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
  const url = modelsUrl(row.baseUrl);
  try {
    const models = await fetchUpstreamModels(row.baseUrl, row.apiKey, row.timeoutMs);
    const latencyMs = Date.now() - started;
    let synced = 0;
    if (models.length > 0 && isUnrestrictedModels(row.models)) {
      await db
        .update(channels)
        .set({ models: toJsonArray(models), updatedAt: new Date() })
        .where(eq(channels.id, row.id));
      synced = models.length;
    }
    return c.json({
      ok: true,
      statusCode: 200,
      latencyMs,
      preview: `discovered ${models.length} models`,
      models: models.slice(0, 50),
      modelCount: models.length,
      synced,
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

adminRoutes.post("/channels/:id/sync-models", async (c) => {
  const idParam = c.req.param("id");
  const row = await db.query.channels.findFirst({ where: eq(channels.id, idParam) });
  if (!row) return c.json({ error: "Not found" }, 404);

  const previous = explicitChannelModels(row.models);

  // Disabled channel: clear catalog for users + detach from routes
  if (!row.enabled) {
    // Prefer explicit list; otherwise count routes still pointing at this channel
    let removed = previous.length;
    if (removed === 0) {
      const routes = await db.select().from(modelRoutes);
      removed = routes.filter((r) =>
        parseJsonArray(r.channelIds).includes(row.id),
      ).length;
    }
    await db
      .update(channels)
      .set({ models: toJsonArray([]), updatedAt: new Date() })
      .where(eq(channels.id, row.id));
    await detachChannelFromModelRoutes(row.id);
    return c.json({
      ok: true,
      cleared: true,
      modelCount: removed,
      models: [] as string[],
    });
  }

  try {
    const models = await fetchUpstreamModels(row.baseUrl, row.apiKey, row.timeoutMs);
    await db
      .update(channels)
      .set({ models: toJsonArray(models), updatedAt: new Date() })
      .where(eq(channels.id, row.id));
    await syncChannelModelRoutes(row.id, models);
    return c.json({
      ok: true,
      cleared: false,
      modelCount: models.length,
      models: models.slice(0, 100),
    });
  } catch (err) {
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      502,
    );
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
    userId: z.string().nullable().optional(),
    quota: z.number().int().default(-1),
    rateLimit: z.number().int().min(0).default(60),
    concurrency: z.number().int().min(0).default(0),
    allowedModels: z.array(z.string()).default([]),
    groupName: z.string().max(64).optional(),
    ipAllowlist: z.array(z.union([z.string(), ipRuleSchema])).optional(),
    ipRules: z.array(ipRuleSchema).optional(),
    routeIds: z.array(z.string()).default([]),
    expiresAt: z.number().nullable().optional(),
    remark: z.string().optional(),
    enabled: z.boolean().optional(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  const key = generateApiKey();
  const ipRules =
    bodyToIpRules(v) ??
    parseIpRules([]);
  const row = {
    id: id("tk"),
    userId: v.userId ?? null,
    name: v.name,
    keyHash: key.hash,
    keyPrefix: key.prefix,
    keyPlain: key.key,
    quota: v.quota,
    usedQuota: 0,
    rateLimit: v.rateLimit,
    concurrency: v.concurrency,
    enabled: v.enabled ?? true,
    allowedModels: toJsonArray(v.allowedModels),
    groupName: (v.groupName ?? "").trim(),
    ipAllowlist: serializeIpRules(ipRules),
    routeIds: toJsonArray(v.routeIds),
    expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
    remark: v.remark ?? "",
  };
  await db.insert(tokens).values(row);
  return c.json(
    {
      data: publicToken({
        ...row,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
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
  if (body.concurrency != null) patch.concurrency = Number(body.concurrency);
  if (body.enabled != null) patch.enabled = Boolean(body.enabled);
  if (body.allowedModels != null) patch.allowedModels = toJsonArray(body.allowedModels);
  if (body.groupName != null) patch.groupName = String(body.groupName).trim();
  const ipRules = bodyToIpRules(body);
  if (ipRules != null) {
    patch.ipAllowlist = serializeIpRules(ipRules);
  }
  if (body.routeIds != null) {
    const list = Array.isArray(body.routeIds)
      ? body.routeIds.map(String)
      : String(body.routeIds)
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    patch.routeIds = toJsonArray(list);
  }
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
    published: z.boolean().default(false),
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
    published: v.published,
  };
  await db.insert(modelRoutes).values(row);
  return c.json(
    {
      data: {
        ...row,
        channelIds: v.channelIds,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    201,
  );
});

adminRoutes.put("/models/:id", async (c) => {
  const idParam = c.req.param("id");
  const body = await c.req.json();
  const patch: Partial<typeof modelRoutes.$inferInsert> = { updatedAt: new Date() };
  if (body.model != null) patch.model = String(body.model);
  if (body.channelIds != null) patch.channelIds = toJsonArray(body.channelIds);
  if (body.rewriteModel !== undefined) patch.rewriteModel = body.rewriteModel || null;
  if (body.enabled != null) patch.enabled = Boolean(body.enabled);
  if (body.published != null) patch.published = Boolean(body.published);
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
