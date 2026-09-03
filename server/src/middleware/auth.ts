import { createMiddleware } from "hono/factory";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { requestLogs, tokens, users, type Token } from "../db/schema.js";
import { extractBearer, hashKey, parseJsonArray } from "../utils/crypto.js";
import { verifyAdminToken, verifyToken } from "../utils/jwt.js";
import { checkRateLimit } from "../services/rate-limit.js";
import { ALL_API_KEYS, ALL_MENU_KEYS } from "../rbac/permissions.js";
import { getRoleById, roleAllowsAdmin } from "../services/roles.js";
import { isIpAllowed, parseIpRules } from "../utils/ip-allow.js";
import { getRequestClientIp } from "../utils/client-ip.js";

export type AuthVars = {
  Variables: {
    token: Token;
    apiKey: string;
  };
};

export type SessionVars = {
  Variables: {
    auth: {
      username: string;
      role: "admin" | "user";
      userId?: string;
      menuPerms?: string[];
    };
  };
};

export type AdminVars = {
  Variables: {
    adminAuth: {
      username: string;
      userId?: string;
      isSuper: boolean;
      roleName?: string;
      menuPerms: string[];
      apiPerms: string[];
    };
  };
};

export const requireApiToken = createMiddleware<AuthVars>(async (c, next) => {
  const raw =
    extractBearer(c.req.header("Authorization")) ??
    c.req.header("x-api-key") ??
    null;
  if (!raw) {
    return c.json(
      { error: { message: "Missing API key", type: "auth_error" } },
      401,
    );
  }

  const row = await db.query.tokens.findFirst({
    where: eq(tokens.keyHash, hashKey(raw)),
  });
  if (!row || !row.enabled) {
    return c.json(
      { error: { message: "Invalid API key", type: "auth_error" } },
      401,
    );
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return c.json(
      { error: { message: "API key expired", type: "auth_error" } },
      401,
    );
  }
  if (row.quota >= 0 && row.usedQuota >= row.quota) {
    return c.json(
      { error: { message: "Quota exceeded", type: "quota_error" } },
      429,
    );
  }
  const period = await assertPeriodQuota(row);
  if (period) return period;

  const rl = checkRateLimit(`token:${row.id}`, row.rateLimit);
  if (!rl.ok) {
    c.header("Retry-After", String(Math.ceil(rl.resetMs / 1000)));
    return c.json(
      { error: { message: "Rate limit exceeded", type: "rate_limit_error" } },
      429,
    );
  }
  c.header("X-RateLimit-Limit", String(row.rateLimit));
  c.header("X-RateLimit-Remaining", String(rl.remaining));

  const clientIp = getRequestClientIp(c);
  const allow = parseIpRules(row.ipAllowlist ?? "[]");
  if (!isIpAllowed(clientIp, allow)) {
    return c.json(
      { error: { message: "IP not allowed for this key", type: "permission_error" } },
      403,
    );
  }

  // Touch last used (best-effort)
  void (async () => {
    try {
      await db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, row.id));
    } catch {
      /* ignore */
    }
  })();

  c.set("token", row);
  c.set("apiKey", raw);
  await next();
});

async function assertPeriodQuota(row: Token) {
  const daily = row.dailyQuota ?? -1;
  const monthly = row.monthlyQuota ?? -1;
  if (daily < 0 && monthly < 0) return null;
  const now = Date.now();
  if (daily >= 0) {
    const used = await sumTokenUsage(row.id, utcDayStart(now));
    if (used >= daily) {
      return cJsonQuota("Daily quota exceeded");
    }
  }
  if (monthly >= 0) {
    const used = await sumTokenUsage(row.id, utcMonthStart(now));
    if (used >= monthly) {
      return cJsonQuota("Monthly quota exceeded");
    }
  }
  return null;
}

function cJsonQuota(message: string) {
  return new Response(JSON.stringify({ error: { message, type: "quota_error" } }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
}

async function sumTokenUsage(tokenId: string, since: Date): Promise<number> {
  const row = await db
    .select({ n: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)` })
    .from(requestLogs)
    .where(and(eq(requestLogs.tokenId, tokenId), gte(requestLogs.createdAt, since)));
  return Number(row[0]?.n ?? 0);
}

function utcDayStart(now: number) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function utcMonthStart(now: number) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function assertModelAllowed(token: Token, model: string): boolean {
  const allowed = parseJsonArray(token.allowedModels);
  if (allowed.length === 0) return true;
  return allowed.includes(model) || allowed.includes("*");
}

export const requireAdmin = createMiddleware<AdminVars>(async (c, next) => {
  const raw = extractBearer(c.req.header("Authorization"));
  if (!raw) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const payload = verifyAdminToken(raw);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!payload.userId) {
    c.set("adminAuth", {
      username: payload.sub,
      isSuper: true,
      roleName: "超级管理员",
      menuPerms: ALL_MENU_KEYS.filter((k) => !k.startsWith("menu.portal.")),
      apiPerms: [...ALL_API_KEYS],
    });
    await next();
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });
  if (!user || !user.enabled) {
    return c.json({ error: "Account disabled" }, 403);
  }
  const role = await getRoleById(user.roleId);
  if (!roleAllowsAdmin(role)) {
    return c.json({ error: "无管理端权限" }, 403);
  }
  const menuPerms = role ? parseJsonArray(role.menuPerms) : [];
  const apiPerms = role ? parseJsonArray(role.apiPerms) : [];
  c.set("adminAuth", {
    username: user.username,
    userId: user.id,
    isSuper: false,
    roleName: role?.name ?? "管理员",
    menuPerms: menuPerms.filter((k) => !k.startsWith("menu.portal.")),
    apiPerms,
  });
  await next();
});

export function hasApiPerm(
  auth: AdminVars["Variables"]["adminAuth"],
  ...need: string[]
): boolean {
  if (auth.isSuper) return true;
  return need.some((k) => auth.apiPerms.includes(k));
}

export const requireUser = createMiddleware<SessionVars>(async (c, next) => {
  const raw = extractBearer(c.req.header("Authorization"));
  if (!raw) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const payload = verifyToken(raw);
  if (!payload || !payload.userId || payload.role !== "user") {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });
  if (!user || !user.enabled) {
    return c.json({ error: "Account disabled" }, 403);
  }
  const role = await getRoleById(user.roleId);
  if (roleAllowsAdmin(role)) {
    return c.json({ error: "请使用管理端登录" }, 403);
  }
  const menuPerms = role ? parseJsonArray(role.menuPerms) : [];
  c.set("auth", {
    username: payload.sub,
    role: "user",
    userId: user.id,
    menuPerms,
  });
  await next();
});
