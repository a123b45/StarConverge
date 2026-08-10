import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tokens, users, type Token } from "../db/schema.js";
import { extractBearer, hashKey, parseJsonArray } from "../utils/crypto.js";
import { verifyAdminToken, verifyToken } from "../utils/jwt.js";
import { checkRateLimit } from "../services/rate-limit.js";

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

  c.set("token", row);
  c.set("apiKey", raw);
  await next();
});

export function assertModelAllowed(token: Token, model: string): boolean {
  const allowed = parseJsonArray(token.allowedModels);
  if (allowed.length === 0) return true;
  return allowed.includes(model) || allowed.includes("*");
}

export const requireAdmin = createMiddleware(async (c, next) => {
  const raw = extractBearer(c.req.header("Authorization"));
  if (!raw) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const payload = verifyAdminToken(raw);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

export const requireUser = createMiddleware<SessionVars>(async (c, next) => {
  const raw = extractBearer(c.req.header("Authorization"));
  if (!raw) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const payload = verifyToken(raw);
  if (!payload || payload.role !== "user" || !payload.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });
  if (!user || !user.enabled) {
    return c.json({ error: "Account disabled" }, 403);
  }
  c.set("auth", {
    username: payload.sub,
    role: "user",
    userId: user.id,
  });
  await next();
});
