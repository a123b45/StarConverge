import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { tokens, users } from "../db/schema.js";
import { config } from "../config.js";
import {
  hashPassword,
  id,
  safeEqual,
  verifyPassword,
} from "../utils/crypto.js";
import { signToken, verifyToken } from "../utils/jwt.js";
import { extractBearer } from "../utils/crypto.js";

export const authRoutes = new Hono();

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return c.json({ error: "请输入用户名和密码" }, 400);
  }

  // Env admin first
  if (
    safeEqual(username, config.adminUsername) &&
    safeEqual(password, config.adminPassword)
  ) {
    const token = signToken(username, "admin");
    return c.json({
      token,
      username,
      role: "admin" as const,
      redirect: "/admin",
    });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return c.json({ error: "用户名或密码错误" }, 401);
  }
  if (!user.enabled) {
    return c.json({ error: "账号已禁用，请联系管理员" }, 403);
  }
  const token = signToken(user.username, "user", user.id);
  return c.json({
    token,
    username: user.username,
    role: "user" as const,
    userId: user.id,
    displayName: user.displayName,
    redirect: "/app",
  });
});

authRoutes.post("/register", async (c) => {
  const schema = z.object({
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, underscore"),
    password: z.string().min(6).max(128),
    displayName: z.string().max(64).optional(),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { username, password, displayName } = parsed.data;

  if (safeEqual(username, config.adminUsername)) {
    return c.json({ error: "Username unavailable" }, 409);
  }
  const existing = await db.query.users.findFirst({
    where: eq(users.username, username),
  });
  if (existing) {
    return c.json({ error: "Username already taken" }, 409);
  }

  const row = {
    id: id("usr"),
    username,
    passwordHash: hashPassword(password),
    displayName: displayName?.trim() || username,
    role: "user",
    enabled: true,
  };
  await db.insert(users).values(row);
  const token = signToken(row.username, "user", row.id);
  return c.json(
    {
      token,
      username: row.username,
      role: "user" as const,
      userId: row.id,
      displayName: row.displayName,
      redirect: "/app",
    },
    201,
  );
});

authRoutes.get("/me", async (c) => {
  const raw = extractBearer(c.req.header("Authorization"));
  if (!raw) return c.json({ error: "Unauthorized" }, 401);
  const payload = verifyToken(raw);
  if (!payload) return c.json({ error: "Unauthorized" }, 401);

  if (payload.role === "admin") {
    return c.json({
      username: payload.sub,
      role: "admin",
      redirect: "/admin",
    });
  }

  if (!payload.userId) return c.json({ error: "Unauthorized" }, 401);
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });
  if (!user || !user.enabled) {
    return c.json({ error: "Account disabled" }, 403);
  }

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
    role: "user",
    userId: user.id,
    displayName: user.displayName,
    enabled: user.enabled,
    quota: unlimited ? -1 : quota,
    usedQuota,
    tokenCount: userTokens.length,
    redirect: "/app",
  });
});
