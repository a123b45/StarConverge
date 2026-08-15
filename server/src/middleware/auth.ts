import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tokens, users, type Token } from "../db/schema.js";
import { extractBearer, hashKey, parseJsonArray } from "../utils/crypto.js";
import { verifyAdminToken, verifyToken } from "../utils/jwt.js";
import { checkRateLimit } from "../services/rate-limit.js";
import { ALL_API_KEYS, ALL_MENU_KEYS } from "../rbac/permissions.js";
import { getRoleById, roleAllowsAdmin } from "../services/roles.js";
import { isIpAllowed, parseIpRules } from "../utils/ip-allow.js";

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

  const clientIp =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    undefined;
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
