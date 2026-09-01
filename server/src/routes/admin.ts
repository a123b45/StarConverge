import { Hono } from "hono";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  cardKeys,
  channels,
  modelPrices,
  modelRoutes,
  proxyRoutes,
  requestLogs,
  roles,
  tokens,
  users,
} from "../db/schema.js";
import {
  notifyModelsPublished,
  notifyPricesChanged,
} from "../services/notifications.js";
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
import { getDashboardStats, getUsageAnalytics, publicChannel, publicToken } from "../services/stats.js";
import {
  loadChannelPricingCatalog,
  pricingUrlFromBaseUrl,
  upstreamModelNameForChannel,
} from "../services/upstream-pricing.js";
import { syncChannelPricing } from "../services/pricing-sync.js";
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
import { buildExcelXml } from "../utils/excel-xml.js";
import { cardStatus, createCardKeys } from "../services/card-keys.js";

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

/** Auto 1:1 catalog routes created by「同步模型」; custom alias/strategy routes are untouched. */
function isAutoCatalogRoute(r: typeof modelRoutes.$inferSelect): boolean {
  let hasTargets = false;
  try {
    const raw = JSON.parse(r.targets || "[]") as unknown;
    hasTargets = Array.isArray(raw) && raw.length > 0;
  } catch {
    hasTargets = false;
  }
  if (hasTargets) return false;
  const strategy = String(r.strategy || "full").toLowerCase();
  if (strategy !== "full") return false;
  if (r.smartSimpleModel || r.smartComplexModel) return false;
  if (r.rewriteModel && r.rewriteModel !== r.model) return false;
  return true;
}

/** Remove channel from all model_routes; delete routes left with no channels. */
async function detachChannelFromModelRoutes(channelId: string) {
  const rows = await db.select().from(modelRoutes);
  for (const r of rows) {
    let targets: Array<{ channelId: string; upstreamModel: string; weight?: number }> =
      [];
    try {
      const raw = JSON.parse(r.targets || "[]") as unknown;
      if (Array.isArray(raw)) {
        targets = raw.filter(
          (t): t is { channelId: string; upstreamModel: string; weight?: number } =>
            !!t &&
            typeof t === "object" &&
            typeof (t as { channelId?: unknown }).channelId === "string" &&
            typeof (t as { upstreamModel?: unknown }).upstreamModel === "string",
        );
      }
    } catch {
      targets = [];
    }

    const custom = !isAutoCatalogRoute(r);

    if (targets.length > 0) {
      const next = targets.filter((t) => t.channelId !== channelId);
      if (next.length === 0) {
        if (custom) {
          // Keep manual routes; clear targets so admin can rebind later.
          await db
            .update(modelRoutes)
            .set({
              targets: "[]",
              channelIds: toJsonArray([]),
              updatedAt: new Date(),
            })
            .where(eq(modelRoutes.id, r.id));
        } else {
          await db.delete(modelRoutes).where(eq(modelRoutes.id, r.id));
        }
      } else if (next.length !== targets.length) {
        const channelIds = [...new Set(next.map((t) => t.channelId))];
        await db
          .update(modelRoutes)
          .set({
            targets: JSON.stringify(next),
            channelIds: toJsonArray(channelIds),
            rewriteModel: next[0]?.upstreamModel ?? null,
            updatedAt: new Date(),
          })
          .where(eq(modelRoutes.id, r.id));
      }
      continue;
    }

    const ids = parseJsonArray(r.channelIds).filter((cid) => cid !== channelId);
    if (ids.length === 0) {
      if (custom) {
        if (parseJsonArray(r.channelIds).includes(channelId)) {
          await db
            .update(modelRoutes)
            .set({ channelIds: toJsonArray([]), updatedAt: new Date() })
            .where(eq(modelRoutes.id, r.id));
        }
      } else if (parseJsonArray(r.channelIds).includes(channelId)) {
        await db.delete(modelRoutes).where(eq(modelRoutes.id, r.id));
      }
    } else if (ids.length !== parseJsonArray(r.channelIds).length) {
      await db
        .update(modelRoutes)
        .set({ channelIds: toJsonArray(ids), updatedAt: new Date() })
        .where(eq(modelRoutes.id, r.id));
    }
  }
  await pruneOrphanModelRoutes();
}

/**
 * Sync only auto catalog routes with this channel's upstream model list.
 * Never create/delete/detach manually configured routes in「路由管理」.
 */
async function syncChannelModelRoutes(channelId: string, models: string[]) {
  const keep = new Set(models.filter((m) => m && m !== "*"));
  const rows = await db.select().from(modelRoutes);

  for (const r of rows) {
    if (!isAutoCatalogRoute(r)) continue;
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
      strategy: "full",
      targets: "[]",
      enabled: true,
      published: false,
    });
  }
  await pruneOrphanModelRoutes();
}

/** Drop orphan auto-catalog routes. Manual alias/strategy routes are preserved. */
async function pruneOrphanModelRoutes() {
  const chRows = await db.select().from(channels);
  const channelIdSet = new Set(chRows.map((c) => c.id));
  const catalog = new Set<string>();
  for (const ch of chRows) {
    for (const m of explicitChannelModels(ch.models)) catalog.add(m);
  }
  const routes = await db.select().from(modelRoutes);
  for (const r of routes) {
    const custom = !isAutoCatalogRoute(r);
    const ids = parseJsonArray(r.channelIds).filter((id) => channelIdSet.has(id));

    if (!ids.length) {
      // Keep manually created routes even if channels were removed.
      if (!custom) {
        await db.delete(modelRoutes).where(eq(modelRoutes.id, r.id));
      } else if (parseJsonArray(r.channelIds).length) {
        await db
          .update(modelRoutes)
          .set({ channelIds: toJsonArray([]), updatedAt: new Date() })
          .where(eq(modelRoutes.id, r.id));
      }
      continue;
    }

    if (ids.length !== parseJsonArray(r.channelIds).length) {
      await db
        .update(modelRoutes)
        .set({ channelIds: toJsonArray(ids), updatedAt: new Date() })
        .where(eq(modelRoutes.id, r.id));
    }

    // Auto-synced 1:1 routes only: drop if model left the channel catalog.
    if (!custom && !catalog.has(r.model)) {
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
  const grainRaw = String(c.req.query("grain") ?? "hour");
  const grain =
    grainRaw === "minute" || grainRaw === "day" || grainRaw === "hour"
      ? grainRaw
      : "hour";
  return c.json(await getDashboardStats(grain));
});

adminRoutes.get("/usage", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.usage.read", "api.dashboard.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  const days = Number(c.req.query("days") ?? 30);
  const groupByRaw = String(c.req.query("groupBy") ?? "model");
  const groupBy = groupByRaw === "token" ? "token" : "model";
  return c.json(
    await getUsageAnalytics({
      days: Number.isFinite(days) ? days : 30,
      groupBy,
    }),
  );
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

// ---- Customers (billing view of users) ----
function usdFromCents(cents: number) {
  return Math.round(cents) / 100;
}

function centsFromUsd(usd: number) {
  return Math.round(usd * 100);
}

/** Model prices store milli-USD (1/1000 USD) per 1M tokens — supports 3 decimal places. */
const PRICE_UNIT = 1000;

function usdFromPriceUnit(units: number) {
  return Math.round(units) / PRICE_UNIT;
}

function priceUnitFromUsd(usd: number) {
  return Math.round(usd * PRICE_UNIT);
}

adminRoutes.get("/customers/stats", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.customers.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  const allUsers = await db.select().from(users);
  const allTokens = await db.select({ id: tokens.id }).from(tokens);
  const active = allUsers.filter((u) => u.enabled).length;
  return c.json({
    data: {
      customerCount: allUsers.length,
      keyCount: allTokens.length,
      activeCount: active,
    },
  });
});

adminRoutes.get("/customers", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.customers.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  const data = [];
  for (const u of rows) {
    if (q) {
      const hay = `${u.username} ${u.email || ""} ${u.displayName || ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    const tks = await db.select().from(tokens).where(eq(tokens.userId, u.id));
    const role = await getRoleById(u.roleId);
    data.push({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      enabled: u.enabled,
      balance: usdFromCents(u.balanceCents ?? 0),
      totalRecharged: usdFromCents(u.totalRechargedCents ?? 0),
      lastRechargedAt: u.lastRechargedAt,
      tokenCount: tks.length,
      allowedModels: parseJsonArray(u.allowedModels || "[]"),
      roleId: u.roleId,
      roleName: role?.name ?? u.role,
      roleKey: role?.key ?? null,
      createdAt: u.createdAt,
    });
  }
  return c.json({ data });
});

adminRoutes.post("/customers", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.customers.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const schema = z.object({
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(6).max(128),
    email: z.string().email().max(128).optional().nullable(),
    displayName: z.string().max(64).optional(),
    enabled: z.boolean().default(true),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  if (safeEqual(v.username, config.adminUsername)) {
    return c.json({ error: "Username reserved" }, 409);
  }
  const portalRole = await db.query.roles.findFirst({
    where: eq(roles.key, "portal_user"),
  });
  if (!portalRole) return c.json({ error: "用户角色不存在" }, 500);
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
    role: portalRole.name,
    roleId: portalRole.id,
    enabled: v.enabled,
    balanceCents: 0,
    totalRechargedCents: 0,
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
        balance: 0,
        totalRecharged: 0,
        lastRechargedAt: null,
        tokenCount: 0,
        roleId: row.roleId,
        roleName: portalRole.name,
        roleKey: portalRole.key,
        createdAt: new Date(),
      },
    },
    201,
  );
});

adminRoutes.patch("/customers/:id", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.customers.write")) {
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
  if (body.balance != null) {
    const bal = Number(body.balance);
    if (!Number.isFinite(bal) || bal < 0) {
      return c.json({ error: "余额无效" }, 400);
    }
    patch.balanceCents = centsFromUsd(bal);
  }
  if (body.allowedModels != null) {
    if (!Array.isArray(body.allowedModels)) {
      return c.json({ error: "模型权限格式错误" }, 400);
    }
    patch.allowedModels = toJsonArray(
      body.allowedModels.map((m: unknown) => String(m).trim()).filter(Boolean),
    );
  }
  if (body.username != null) {
    const next = String(body.username).trim();
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(next)) {
      return c.json({ error: "用户名格式无效" }, 400);
    }
    if (next !== existing.username) {
      const clash = await db.query.users.findFirst({
        where: eq(users.username, next),
      });
      if (clash) return c.json({ error: "用户名已被占用" }, 409);
      patch.username = next;
      if (!existing.displayName || existing.displayName === existing.username) {
        patch.displayName = next;
      }
    }
  }
  await db.update(users).set(patch).where(eq(users.id, idParam));
  const row = await db.query.users.findFirst({ where: eq(users.id, idParam) });
  const role = await getRoleById(row!.roleId);
  const tks = await db.select().from(tokens).where(eq(tokens.userId, idParam));
  return c.json({
    data: {
      id: row!.id,
      username: row!.username,
      displayName: row!.displayName,
      email: row!.email,
      enabled: row!.enabled,
      balance: usdFromCents(row!.balanceCents ?? 0),
      totalRecharged: usdFromCents(row!.totalRechargedCents ?? 0),
      lastRechargedAt: row!.lastRechargedAt,
      tokenCount: tks.length,
      allowedModels: parseJsonArray(row!.allowedModels || "[]"),
      roleId: row!.roleId,
      roleName: role?.name ?? row!.role,
      roleKey: role?.key ?? null,
      createdAt: row!.createdAt,
    },
  });
});

adminRoutes.post("/customers/:id/recharge", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.customers.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const idParam = c.req.param("id");
  const existing = await db.query.users.findFirst({ where: eq(users.id, idParam) });
  if (!existing) return c.json({ error: "Not found" }, 404);
  const schema = z.object({
    amount: z.number().positive().max(1_000_000),
    remark: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const add = centsFromUsd(parsed.data.amount);
  const now = new Date();
  await db
    .update(users)
    .set({
      balanceCents: (existing.balanceCents ?? 0) + add,
      totalRechargedCents: (existing.totalRechargedCents ?? 0) + add,
      lastRechargedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, idParam));
  const row = await db.query.users.findFirst({ where: eq(users.id, idParam) });
  return c.json({
    data: {
      id: row!.id,
      balance: usdFromCents(row!.balanceCents ?? 0),
      totalRecharged: usdFromCents(row!.totalRechargedCents ?? 0),
      lastRechargedAt: row!.lastRechargedAt,
    },
  });
});

adminRoutes.get("/customers/:id/tokens", async (c) => {
  const auth = c.get("adminAuth");
  if (
    !hasApiPerm(auth, "api.customers.read") &&
    !hasApiPerm(auth, "api.tokens.read")
  ) {
    return c.json({ error: "无权限" }, 403);
  }
  const idParam = c.req.param("id");
  const tks = await db
    .select()
    .from(tokens)
    .where(eq(tokens.userId, idParam))
    .orderBy(desc(tokens.createdAt));
  return c.json({
    data: tks.map((t) => ({
      id: t.id,
      name: t.name,
      keyPrefix: t.keyPrefix,
      enabled: t.enabled,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
    })),
  });
});

// ---- Card keys ----
adminRoutes.get("/card-keys", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.cardKeys.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  const rows = await db.select().from(cardKeys).orderBy(desc(cardKeys.createdAt));
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [r.userId, r.redeemedBy].filter((x): x is string => !!x)),
    ),
  ];
  const nameMap = new Map<string, string>();
  if (userIds.length) {
    const named = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, userIds));
    for (const u of named) nameMap.set(u.id, u.username);
  }
  const now = Date.now();
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      code: r.code,
      amount: usdFromCents(r.amountCents),
      expiresAt: r.expiresAt,
      userId: r.userId,
      boundUsername: r.userId ? nameMap.get(r.userId) ?? r.userId : null,
      redeemedAt: r.redeemedAt,
      redeemedBy: r.redeemedBy,
      redeemedUsername: r.redeemedBy
        ? nameMap.get(r.redeemedBy) ?? r.redeemedBy
        : null,
      status: cardStatus(r, now),
      remark: r.remark ?? "",
      createdAt: r.createdAt,
    })),
  });
});

adminRoutes.post("/card-keys", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.cardKeys.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const schema = z.object({
    amount: z.number().positive().max(1_000_000),
    validDays: z.number().int().min(0).max(3650).default(30),
    userId: z.string().nullable().optional(),
    count: z.number().int().min(1).max(20).default(1),
    remark: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  if (v.userId) {
    const target = await db.query.users.findFirst({
      where: eq(users.id, v.userId),
    });
    if (!target) return c.json({ error: "限定用户不存在" }, 400);
  }
  try {
    const created = await createCardKeys({
      amountUsd: v.amount,
      validDays: v.validDays,
      userId: v.userId || null,
      createdBy: auth.userId ?? null,
      remark: v.remark,
      count: v.count,
    });
    return c.json(
      {
        data: created.map((r) => ({
          id: r.id,
          code: r.code,
          amount: usdFromCents(r.amountCents),
          expiresAt: r.expiresAt,
          userId: r.userId,
          status: "unused",
          createdAt: r.createdAt,
        })),
      },
      201,
    );
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "创建失败" },
      400,
    );
  }
});

adminRoutes.delete("/card-keys/:id", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.cardKeys.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const row = await db
    .select()
    .from(cardKeys)
    .where(eq(cardKeys.id, c.req.param("id")))
    .limit(1)
    .then((r) => r[0]);
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.redeemedAt) {
    return c.json({ error: "已使用的卡密不能删除" }, 400);
  }
  await db.delete(cardKeys).where(eq(cardKeys.id, row.id));
  return c.json({ ok: true });
});

// ---- Model pricing ----
function priceMatchesModel(
  row: typeof modelPrices.$inferSelect,
  modelName: string,
) {
  const name = modelName.trim();
  if (!name) return false;
  return (
    row.externalModel === name ||
    row.globalModel === name ||
    (row.providerModel || "") === name
  );
}

async function findEnabledPriceForModel(modelName: string) {
  const rows = await db.select().from(modelPrices);
  return (
    rows.find((p) => p.enabled && priceMatchesModel(p, modelName)) ?? null
  );
}

function pricePublic(row: typeof modelPrices.$inferSelect, channelName: string | null) {
  const input = usdFromPriceUnit(row.inputPer1mCents);
  const output = usdFromPriceUnit(row.outputPer1mCents);
  const cacheHit = usdFromPriceUnit(row.cacheHitPer1mCents ?? 0);
  const cost = usdFromPriceUnit(row.costPer1mCents);
  const sell = input;
  const margin = sell > 0 ? ((sell - cost) / sell) * 100 : 0;
  const diff = sell - cost;
  return {
    id: row.id,
    externalModel: row.externalModel,
    globalModel: row.globalModel,
    providerModel: row.providerModel || "",
    channelId: row.channelId,
    channelName,
    inputPer1m: input,
    outputPer1m: output,
    cacheHitPer1m: cacheHit,
    costPer1m: cost,
    grossMargin: Math.round(margin * 1000) / 1000,
    priceDiff: Math.round(diff * 1000) / 1000,
    enabled: row.enabled,
    remark: row.remark,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

adminRoutes.get("/pricing", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.pricing.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  const rows = await db
    .select({
      price: modelPrices,
      channelName: channels.name,
    })
    .from(modelPrices)
    .leftJoin(channels, eq(modelPrices.channelId, channels.id))
    .orderBy(desc(modelPrices.createdAt));
  return c.json({
    data: rows.map((r) =>
      pricePublic(
        r.price,
        r.price.channelId ? r.channelName : "其他服务商",
      ),
    ),
  });
});

adminRoutes.post("/pricing", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.pricing.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const schema = z.object({
    externalModel: z.string().min(1).max(128),
    globalModel: z.string().min(1).max(128),
    providerModel: z.string().max(128).optional().nullable(),
    channelId: z.string().min(1).optional().nullable(),
    inputPer1m: z.number().min(0).max(1_000_000),
    outputPer1m: z.number().min(0).max(1_000_000),
    cacheHitPer1m: z.number().min(0).max(1_000_000).default(0),
    costPer1m: z.number().min(0).max(1_000_000).default(0),
    enabled: z.boolean().default(true),
    remark: z.string().max(500).optional().nullable(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  if (v.channelId) {
    const ch = await db.query.channels.findFirst({
      where: eq(channels.id, v.channelId),
    });
    if (!ch) return c.json({ error: "服务商不存在" }, 400);
  }
  const row = {
    id: id("price"),
    externalModel: v.externalModel.trim(),
    globalModel: v.globalModel.trim(),
    providerModel: (v.providerModel || "").trim(),
    channelId: v.channelId || null,
    inputPer1mCents: priceUnitFromUsd(v.inputPer1m),
    outputPer1mCents: priceUnitFromUsd(v.outputPer1m),
    cacheHitPer1mCents: priceUnitFromUsd(v.cacheHitPer1m),
    costPer1mCents: priceUnitFromUsd(v.costPer1m),
    enabled: v.enabled,
    remark: v.remark || "",
  };
  await db.insert(modelPrices).values(row);
  await notifyPricesChanged([row.externalModel, row.globalModel, row.providerModel]);
  const ch = row.channelId
    ? await db.query.channels.findFirst({ where: eq(channels.id, row.channelId) })
    : null;
  return c.json(
    {
      data: pricePublic(
        { ...row, createdAt: new Date(), updatedAt: new Date() },
        ch?.name ?? "其他服务商",
      ),
    },
    201,
  );
});

adminRoutes.put("/pricing/:id", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.pricing.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const idParam = c.req.param("id");
  const existing = await db.query.modelPrices.findFirst({
    where: eq(modelPrices.id, idParam),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);
  const schema = z.object({
    externalModel: z.string().min(1).max(128).optional(),
    globalModel: z.string().min(1).max(128).optional(),
    providerModel: z.string().max(128).optional().nullable(),
    channelId: z.string().min(1).optional().nullable(),
    inputPer1m: z.number().min(0).max(1_000_000).optional(),
    outputPer1m: z.number().min(0).max(1_000_000).optional(),
    cacheHitPer1m: z.number().min(0).max(1_000_000).optional(),
    costPer1m: z.number().min(0).max(1_000_000).optional(),
    enabled: z.boolean().optional(),
    remark: z.string().max(500).optional().nullable(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  if (v.channelId) {
    const ch = await db.query.channels.findFirst({
      where: eq(channels.id, v.channelId),
    });
    if (!ch) return c.json({ error: "服务商不存在" }, 400);
  }
  const patch: Partial<typeof modelPrices.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (v.externalModel != null) patch.externalModel = v.externalModel.trim();
  if (v.globalModel != null) patch.globalModel = v.globalModel.trim();
  if (v.providerModel !== undefined) {
    patch.providerModel = (v.providerModel || "").trim();
  }
  if (v.channelId !== undefined) patch.channelId = v.channelId || null;
  if (v.inputPer1m != null) patch.inputPer1mCents = priceUnitFromUsd(v.inputPer1m);
  if (v.outputPer1m != null) patch.outputPer1mCents = priceUnitFromUsd(v.outputPer1m);
  if (v.cacheHitPer1m != null) {
    patch.cacheHitPer1mCents = priceUnitFromUsd(v.cacheHitPer1m);
  }
  if (v.costPer1m != null) patch.costPer1mCents = priceUnitFromUsd(v.costPer1m);
  if (v.enabled != null) patch.enabled = v.enabled;
  if (v.remark !== undefined) patch.remark = v.remark || "";
  const amountsChanged =
    (patch.inputPer1mCents != null &&
      patch.inputPer1mCents !== existing.inputPer1mCents) ||
    (patch.outputPer1mCents != null &&
      patch.outputPer1mCents !== existing.outputPer1mCents) ||
    (patch.cacheHitPer1mCents != null &&
      patch.cacheHitPer1mCents !== existing.cacheHitPer1mCents);
  await db.update(modelPrices).set(patch).where(eq(modelPrices.id, idParam));
  if (amountsChanged) {
    const nextName = patch.externalModel ?? existing.externalModel;
    await notifyPricesChanged([
      nextName,
      patch.globalModel ?? existing.globalModel,
      patch.providerModel ?? existing.providerModel ?? "",
    ]);
  }
  const row = await db.query.modelPrices.findFirst({
    where: eq(modelPrices.id, idParam),
  });
  const ch = row!.channelId
    ? await db.query.channels.findFirst({ where: eq(channels.id, row!.channelId) })
    : null;
  return c.json({
    data: pricePublic(row!, ch?.name ?? "其他服务商"),
  });
});

adminRoutes.delete("/pricing/:id", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.pricing.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  await db.delete(modelPrices).where(eq(modelPrices.id, c.req.param("id")));
  return c.json({ ok: true });
});

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

async function catalogUpstreamModelsForChannel(channelId: string): Promise<string[]> {
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
      /* ignore malformed targets */
    }
  }
  return [...names].sort();
}

async function resolveSyncModelNames(
  channel: typeof channels.$inferSelect,
  scope: "channel" | "catalog" | "upstream",
  upstreamNames: string[],
): Promise<string[]> {
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

adminRoutes.get("/pricing/upstream-meta", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.pricing.read")) {
    return c.json({ error: "无权限" }, 403);
  }
  const channelId = c.req.query("channelId")?.trim();
  if (!channelId) return c.json({ error: "缺少 channelId" }, 400);
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, channelId) });
  if (!ch) return c.json({ error: "服务商不存在" }, 404);

  const pricingUrl = pricingUrlFromBaseUrl(ch.baseUrl);
  try {
    const catalog = await loadChannelPricingCatalog({
      baseUrl: ch.baseUrl,
      apiKey: ch.apiKey,
      timeoutMs: ch.timeoutMs,
    });
    const defaultGroup = catalog.defaultGroup;
    const priceMap = defaultGroup ? catalog.buildPriceMap(defaultGroup) : new Map();
    const channelModels = explicitChannelModels(ch.models);
    const catalogModels = await catalogUpstreamModelsForChannel(channelId);
    return c.json({
      data: {
        channelId,
        channelName: ch.name,
        source: catalog.source,
        pricingUrl: catalog.pricingUrl,
        pricingVersion: catalog.pricingVersion,
        note: catalog.note,
        groups: catalog.groups,
        defaultGroup,
        upstreamModelCount: priceMap.size,
        channelModelCount: channelModels.length,
        catalogModelCount: catalogModels.length,
      },
    });
  } catch (e) {
    return c.json(
      {
        error: e instanceof Error ? e.message : "拉取上游定价失败",
        pricingUrl,
      },
      502,
    );
  }
});

adminRoutes.post("/pricing/sync-upstream", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.pricing.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const schema = z.object({
    channelId: z.string().min(1),
    group: z.string().min(1),
    scope: z.enum(["channel", "catalog", "upstream"]).default("channel"),
    updateExisting: z.boolean().default(true),
    createMissing: z.boolean().default(true),
    setCostFromUpstream: z.boolean().default(true),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;

  const ch = await db.query.channels.findFirst({ where: eq(channels.id, v.channelId) });
  if (!ch) return c.json({ error: "服务商不存在" }, 404);

  try {
    const result = await syncChannelPricing({
      channel: ch,
      group: v.group,
      scope: v.scope,
      updateExisting: v.updateExisting,
      createMissing: v.createMissing,
      setCostFromUpstream: v.setCostFromUpstream,
    });
    return c.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    return c.json(
      {
        error: e instanceof Error ? e.message : "拉取上游定价失败",
        pricingUrl: pricingUrlFromBaseUrl(ch.baseUrl),
      },
      502,
    );
  }
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

const routeTargetSchema = z.object({
  channelId: z.string().min(1),
  upstreamModel: z.string().min(1),
  weight: z.number().positive().optional(),
});

function serializeModelRoute(r: typeof modelRoutes.$inferSelect) {
  let targets: Array<{
    channelId: string;
    upstreamModel: string;
    weight?: number;
  }> = [];
  try {
    const raw = JSON.parse(r.targets || "[]") as unknown;
    if (Array.isArray(raw) && raw.length) {
      targets = raw
        .map((t) => {
          if (!t || typeof t !== "object") return null;
          const o = t as Record<string, unknown>;
          const channelId = String(o.channelId ?? "").trim();
          const upstreamModel = String(o.upstreamModel ?? "").trim();
          if (!channelId || !upstreamModel) return null;
          const w = Number(o.weight);
          return {
            channelId,
            upstreamModel,
            weight: Number.isFinite(w) && w > 0 ? w : 1,
          };
        })
        .filter(Boolean) as typeof targets;
    }
  } catch {
    targets = [];
  }
  if (!targets.length) {
    const ids = parseJsonArray(r.channelIds);
    const upstream = r.rewriteModel || r.model;
    if (ids.length && upstream) {
      targets = ids.map((channelId) => ({
        channelId,
        upstreamModel: upstream,
        weight: 1,
      }));
    }
  }
  return {
    ...r,
    channelIds: parseJsonArray(r.channelIds),
    targets,
    strategy: r.strategy || "full",
    /** true = created via 路由管理 (alias/strategy); false = synced from 供应商 */
    selfBuilt: !isAutoCatalogRoute(r),
  };
}

function deriveFromTargets(
  targets: Array<{ channelId: string; upstreamModel: string; weight?: number }>,
) {
  const channelIds = [...new Set(targets.map((t) => t.channelId))];
  return {
    channelIds,
    rewriteModel: targets[0]?.upstreamModel ?? null,
    targetsJson: JSON.stringify(
      targets.map((t) => ({
        channelId: t.channelId,
        upstreamModel: t.upstreamModel,
        weight: t.weight && t.weight > 0 ? t.weight : 1,
      })),
    ),
  };
}

// ---- Model routes ----
adminRoutes.get("/models", async (c) => {
  const rows = await db.select().from(modelRoutes).orderBy(modelRoutes.model);
  return c.json({
    data: rows.map(serializeModelRoute),
  });
});

adminRoutes.post("/models/sync-pricing", async (c) => {
  const auth = c.get("adminAuth");
  if (!hasApiPerm(auth, "api.pricing.write")) {
    return c.json({ error: "无权限" }, 403);
  }
  const schema = z.object({
    modelIds: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const idFilter = parsed.data.modelIds?.length
    ? new Set(parsed.data.modelIds)
    : null;

  const routes = await db.select().from(modelRoutes);
  const channelRows = await db.select().from(channels);
  const channelById = new Map(channelRows.map((ch) => [ch.id, ch]));
  const existingPrices = await db.select().from(modelPrices);

  type SyncItem = {
    routeId: string;
    displayModel: string;
    upstreamModel: string;
    channelId: string;
  };
  const byChannel = new Map<string, SyncItem[]>();

  for (const raw of routes) {
    if (idFilter && !idFilter.has(raw.id)) continue;
    const route = serializeModelRoute(raw);
    const channelIds = route.channelIds.length
      ? route.channelIds
      : route.targets.map((t) => t.channelId);
    const uniqueChannelIds = [...new Set(channelIds)];
    for (const channelId of uniqueChannelIds) {
      if (!channelById.has(channelId)) continue;
      const upstreamModel = upstreamModelNameForChannel(route, channelId);
      const list = byChannel.get(channelId) ?? [];
      list.push({
        routeId: raw.id,
        displayModel: route.model,
        upstreamModel,
        channelId,
      });
      byChannel.set(channelId, list);
    }
  }

  if (!byChannel.size) {
    return c.json({ error: "模型管理中没有可同步定价的模型" }, 400);
  }

  type ChannelResult = {
    channelId: string;
    channelName: string;
    ok: boolean;
    synced: number;
    created: number;
    updated: number;
    missing: number;
    missingModels: string[];
    error?: string;
    message: string;
  };

  const results: ChannelResult[] = [];
  const changedPriceNames: string[] = [];

  for (const [channelId, items] of byChannel) {
    const ch = channelById.get(channelId)!;
    const deduped = new Map<string, SyncItem>();
    for (const item of items) {
      deduped.set(`${item.displayModel}\0${item.upstreamModel}`, item);
    }
    const work = [...deduped.values()];

    let catalog;
    try {
      catalog = await loadChannelPricingCatalog({
        baseUrl: ch.baseUrl,
        apiKey: ch.apiKey,
        timeoutMs: ch.timeoutMs,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : "拉取上游定价失败";
      results.push({
        channelId,
        channelName: ch.name,
        ok: false,
        synced: 0,
        created: 0,
        updated: 0,
        missing: work.length,
        missingModels: work.map((w) => w.displayModel),
        error: err,
        message: `${ch.name} 定价未同步（${err}）`,
      });
      continue;
    }

    let created = 0;
    let updated = 0;
    const missingModels: string[] = [];
    const priceIndex = new Map<string, typeof modelPrices.$inferSelect>();
    for (const row of existingPrices) {
      if (row.channelId === channelId) {
        priceIndex.set(row.externalModel, row);
        priceIndex.set(row.globalModel, row);
      }
    }

    for (const item of work) {
      const upstream = catalog.resolveBestForModel(item.upstreamModel);
      if (!upstream) {
        missingModels.push(item.displayModel);
        continue;
      }
      const existing = priceIndex.get(item.displayModel);
      const remark =
        `模型管理同步 · ${upstream.group} · ${catalog.pricingVersion ?? ""}`.slice(0, 500);
      const costPer1m = upstream.inputPer1m;

      if (existing) {
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
            providerModel: item.upstreamModel,
            inputPer1mCents: nextInput,
            outputPer1mCents: nextOutput,
            cacheHitPer1mCents: nextCache,
            costPer1mCents: priceUnitFromUsd(costPer1m),
            remark,
            updatedAt: new Date(),
          })
          .where(eq(modelPrices.id, existing.id));
        updated += 1;
        if (priceMoved) changedPriceNames.push(item.displayModel);
        continue;
      }

      const newRow = {
        id: id("price"),
        externalModel: item.displayModel,
        globalModel: item.displayModel,
        providerModel: item.upstreamModel,
        channelId,
        inputPer1mCents: priceUnitFromUsd(upstream.inputPer1m),
        outputPer1mCents: priceUnitFromUsd(upstream.outputPer1m),
        cacheHitPer1mCents: priceUnitFromUsd(upstream.cacheHitPer1m),
        costPer1mCents: priceUnitFromUsd(costPer1m),
        enabled: true,
        remark,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(modelPrices).values(newRow);
      existingPrices.push(newRow);
      priceIndex.set(item.displayModel, newRow);
      created += 1;
      changedPriceNames.push(item.displayModel);
    }

    const synced = created + updated;
    let message: string;
    if (synced === 0) {
      message =
        missingModels.length === work.length
          ? `${ch.name} 定价未同步（上游未找到 ${missingModels.length} 个模型）`
          : `${ch.name} 定价未同步`;
    } else if (missingModels.length > 0) {
      message = `${ch.name} 定价已同步 ${synced} 个模型，${missingModels.length} 个未找到上游定价`;
    } else {
      message = `${ch.name} 定价已同步 ${synced} 个模型`;
    }

    results.push({
      channelId,
      channelName: ch.name,
      ok: synced > 0,
      synced,
      created,
      updated,
      missing: missingModels.length,
      missingModels,
      message,
    });
  }

  const messages = results.map((r) => r.message);
  const totalSynced = results.reduce((n, r) => n + r.synced, 0);
  if (changedPriceNames.length) await notifyPricesChanged(changedPriceNames);

  return c.json({
    ok: totalSynced > 0,
    totalSynced,
    channels: results,
    messages,
  });
});

adminRoutes.post("/models", async (c) => {
  const schema = z.object({
    model: z.string().min(1),
    channelIds: z.array(z.string()).default([]),
    rewriteModel: z.string().nullable().optional(),
    strategy: z.enum(["full", "random", "ratio", "smart"]).default("full"),
    targets: z.array(routeTargetSchema).default([]),
    smartSimpleModel: z.string().nullable().optional(),
    smartComplexModel: z.string().nullable().optional(),
    enabled: z.boolean().default(true),
    published: z.boolean().default(false),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const v = parsed.data;
  let targets = v.targets;
  if (!targets.length && v.channelIds.length && v.rewriteModel) {
    targets = v.channelIds.map((channelId) => ({
      channelId,
      upstreamModel: v.rewriteModel!,
      weight: 1,
    }));
  }
  if (!targets.length) {
    return c.json({ error: "请至少选择一个上游真实模型" }, 400);
  }
  if (v.strategy === "smart") {
    if (!v.smartSimpleModel || !v.smartComplexModel) {
      return c.json({ error: "智能路由需指定简单模型与智能模型" }, 400);
    }
  }
  if (v.published) {
    const priced = await findEnabledPriceForModel(v.model);
    if (!priced) {
      return c.json({ error: "该模型尚未定价，请前往定价" }, 400);
    }
  }
  const derived = deriveFromTargets(targets);
  const row = {
    id: id("mr"),
    model: v.model,
    channelIds: toJsonArray(derived.channelIds),
    rewriteModel: derived.rewriteModel,
    strategy: v.strategy,
    targets: derived.targetsJson,
    smartSimpleModel: v.smartSimpleModel ?? null,
    smartComplexModel: v.smartComplexModel ?? null,
    enabled: v.enabled,
    published: v.published,
  };
  await db.insert(modelRoutes).values(row);
  if (v.published) await notifyModelsPublished([v.model]);
  return c.json(
    {
      data: serializeModelRoute({
        ...row,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    201,
  );
});

adminRoutes.put("/models/:id", async (c) => {
  const idParam = c.req.param("id");
  const existing = await db.query.modelRoutes.findFirst({
    where: eq(modelRoutes.id, idParam),
  });
  if (!existing) return c.json({ error: "Not found" }, 404);
  const schema = z.object({
    model: z.string().min(1).optional(),
    channelIds: z.array(z.string()).optional(),
    rewriteModel: z.string().nullable().optional(),
    strategy: z.enum(["full", "random", "ratio", "smart"]).optional(),
    targets: z.array(routeTargetSchema).optional(),
    smartSimpleModel: z.string().nullable().optional(),
    smartComplexModel: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
    published: z.boolean().optional(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const body = parsed.data;
  const nextModel = (body.model ?? existing.model).trim();
  if (body.published === true) {
    const priced = await findEnabledPriceForModel(nextModel);
    if (!priced) {
      return c.json({ error: "该模型尚未定价，请前往定价" }, 400);
    }
  }
  const patch: Partial<typeof modelRoutes.$inferInsert> = { updatedAt: new Date() };
  if (body.model != null) patch.model = body.model;
  if (body.targets != null) {
    if (!body.targets.length) {
      return c.json({ error: "请至少选择一个上游真实模型" }, 400);
    }
    const derived = deriveFromTargets(body.targets);
    patch.targets = derived.targetsJson;
    patch.channelIds = toJsonArray(derived.channelIds);
    patch.rewriteModel = derived.rewriteModel;
  } else {
    if (body.channelIds != null) patch.channelIds = toJsonArray(body.channelIds);
    if (body.rewriteModel !== undefined) {
      patch.rewriteModel = body.rewriteModel || null;
    }
  }
  if (body.strategy != null) patch.strategy = body.strategy;
  if (body.smartSimpleModel !== undefined) {
    patch.smartSimpleModel = body.smartSimpleModel || null;
  }
  if (body.smartComplexModel !== undefined) {
    patch.smartComplexModel = body.smartComplexModel || null;
  }
  if (body.enabled != null) patch.enabled = Boolean(body.enabled);
  if (body.published != null) patch.published = Boolean(body.published);

  const strategy = body.strategy;
  if (strategy === "smart") {
    const simple =
      body.smartSimpleModel !== undefined
        ? body.smartSimpleModel
        : undefined;
    const complex =
      body.smartComplexModel !== undefined
        ? body.smartComplexModel
        : undefined;
    if (simple === null || simple === "" || complex === null || complex === "") {
      return c.json({ error: "智能路由需指定简单模型与智能模型" }, 400);
    }
  }

  await db.update(modelRoutes).set(patch).where(eq(modelRoutes.id, idParam));
  const row = await db.query.modelRoutes.findFirst({ where: eq(modelRoutes.id, idParam) });
  if (!row) return c.json({ error: "Not found" }, 404);
  if (!existing.published && row.published) {
    await notifyModelsPublished([row.model]);
  }
  return c.json({ data: serializeModelRoute(row) });
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

function logsWhere(query: {
  model?: string | undefined;
  tokenId?: string | undefined;
  sinceHours?: number;
}) {
  const conditions = [];
  if (query.model) {
    conditions.push(
      or(
        eq(requestLogs.model, query.model),
        eq(requestLogs.upstreamModel, query.model),
      ),
    );
  }
  if (query.tokenId) conditions.push(eq(requestLogs.tokenId, query.tokenId));
  if (query.sinceHours && query.sinceHours > 0) {
    conditions.push(
      gte(requestLogs.createdAt, new Date(Date.now() - query.sinceHours * 3600_000)),
    );
  }
  return conditions.length ? and(...conditions) : undefined;
}

function formatLogTime(d: Date | string | number | null | undefined) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
}

const logSelectFields = {
  id: requestLogs.id,
  tokenId: requestLogs.tokenId,
  channelId: requestLogs.channelId,
  channelName: channels.name,
  username: users.username,
  displayName: users.displayName,
  tokenName: tokens.name,
  model: requestLogs.model,
  upstreamModel: requestLogs.upstreamModel,
  path: requestLogs.path,
  method: requestLogs.method,
  statusCode: requestLogs.statusCode,
  promptTokens: requestLogs.promptTokens,
  completionTokens: requestLogs.completionTokens,
  totalTokens: requestLogs.totalTokens,
  durationMs: requestLogs.durationMs,
  ip: requestLogs.ip,
  error: requestLogs.error,
  requestPreview: requestLogs.requestPreview,
  responsePreview: requestLogs.responsePreview,
  createdAt: requestLogs.createdAt,
};

// ---- Logs ----
adminRoutes.get("/logs", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const where = logsWhere({
    model: c.req.query("model"),
    tokenId: c.req.query("tokenId"),
    sinceHours: Number(c.req.query("sinceHours") ?? 0),
  });
  const rows = await db
    .select(logSelectFields)
    .from(requestLogs)
    .leftJoin(channels, eq(requestLogs.channelId, channels.id))
    .leftJoin(tokens, eq(requestLogs.tokenId, tokens.id))
    .leftJoin(users, eq(tokens.userId, users.id))
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

adminRoutes.get("/logs/export", async (c) => {
  const where = logsWhere({
    model: c.req.query("model"),
    tokenId: c.req.query("tokenId"),
    sinceHours: Number(c.req.query("sinceHours") ?? 0),
  });
  const rows = await db
    .select(logSelectFields)
    .from(requestLogs)
    .leftJoin(channels, eq(requestLogs.channelId, channels.id))
    .leftJoin(tokens, eq(requestLogs.tokenId, tokens.id))
    .leftJoin(users, eq(tokens.userId, users.id))
    .where(where)
    .orderBy(desc(requestLogs.createdAt))
    .limit(5000);

  const xml = buildExcelXml(
    ["用户名", "输入内容", "输出内容", "调用模型", "时间"],
    rows.map((r) => [
      r.username || r.displayName || r.tokenName || "—",
      (r.requestPreview ?? "").trim(),
      (r.responsePreview ?? "").trim(),
      r.model || "—",
      formatLogTime(r.createdAt),
    ]),
    "调用明细",
  );
  const stamp = formatLogTime(new Date()).replace(/[-:\s]/g, "").slice(0, 12);
  return c.body(xml, 200, {
    "Content-Type": "application/vnd.ms-excel; charset=utf-8",
    "Content-Disposition": `attachment; filename="starconverge-logs-${stamp}.xls"`,
  });
});
