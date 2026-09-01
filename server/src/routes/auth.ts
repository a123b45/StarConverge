import { Hono } from "hono";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { passwordResets, tokens, users } from "../db/schema.js";
import { config } from "../config.js";
import {
  hashPassword,
  id,
  safeEqual,
  verifyPassword,
} from "../utils/crypto.js";
import { signToken, verifyToken } from "../utils/jwt.js";
import { extractBearer } from "../utils/crypto.js";
import {
  createResetToken,
  hashToken,
  mailConfigured,
  sendPasswordResetEmail,
  sendRegisterCodeEmail,
} from "../services/mail.js";
import { createCaptcha, consumeCaptcha } from "../services/captcha.js";
import {
  consumeEmailCode,
  issueEmailCode,
  remainingSendCooldown,
} from "../services/email-codes.js";
import { getRequestClientIp } from "../utils/client-ip.js";
import {
  getPortalUserRole,
  getRoleById,
  roleAllowsAdmin,
} from "../services/roles.js";

export const authRoutes = new Hono();

const emailSchema = z.string().email().max(128);

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return c.json({ error: "请输入用户名/邮箱和密码" }, 400);
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
    where: or(eq(users.username, username), eq(users.email, username.toLowerCase())),
  });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return c.json({ error: "用户名或密码错误" }, 401);
  }
  if (!user.enabled) {
    return c.json({ error: "账号已禁用，请联系管理员" }, 403);
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  const role = await getRoleById(user.roleId);
  if (roleAllowsAdmin(role)) {
    const token = signToken(user.username, "admin", user.id);
    return c.json({
      token,
      username: user.username,
      role: "admin" as const,
      userId: user.id,
      displayName: user.displayName,
      roleName: role?.name ?? "管理员",
      redirect: "/admin",
    });
  }

  const token = signToken(user.username, "user", user.id);
  return c.json({
    token,
    username: user.username,
    role: "user" as const,
    userId: user.id,
    displayName: user.displayName,
    roleName: role?.name ?? "用户",
    redirect: "/app/models",
  });
});

authRoutes.get("/captcha", (c) => {
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.json({ data: createCaptcha() });
});

const sendHits = new Map<string, number[]>();
function tooManySends(ip: string) {
  const now = Date.now();
  const hits = (sendHits.get(ip) ?? []).filter((t) => now - t < 60 * 60_000);
  if (hits.length >= 8) {
    sendHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  sendHits.set(ip, hits);
  return false;
}

authRoutes.post("/register/send-code", async (c) => {
  const schema = z.object({
    email: emailSchema,
    captchaId: z.string().min(8).max(64),
    captcha: z.string().min(5).max(8),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "请填写邮箱并完成图片验证" }, 400);
  }
  if (!mailConfigured()) {
    return c.json({ error: "邮件服务未配置，请联系管理员" }, 503);
  }
  const ip = getRequestClientIp(c) || "unknown";
  if (tooManySends(ip)) {
    return c.json({ error: "发送过于频繁，请稍后再试" }, 429);
  }
  if (!consumeCaptcha(parsed.data.captchaId, parsed.data.captcha)) {
    return c.json({ error: "图片验证码错误或已过期" }, 400);
  }
  const email = parsed.data.email.toLowerCase();
  const wait = remainingSendCooldown(email);
  if (wait > 0) {
    return c.json({ error: `请 ${wait} 秒后再发送` }, 429);
  }
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return c.json({ error: "该邮箱已注册" }, 409);
  }
  const code = issueEmailCode(email);
  const mail = await sendRegisterCodeEmail(email, code);
  if (!mail.sent) {
    return c.json({ error: mail.error || "验证码发送失败，请稍后重试" }, 502);
  }
  return c.json({ ok: true, message: "验证码已发送，请查收邮箱" });
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
    email: emailSchema,
    code: z.string().regex(/^\d{6}$/, "验证码为 6 位数字"),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "请填写有效的用户名、邮箱、密码和邮箱验证码" }, 400);
  }
  const { username, password, displayName, email, code } = parsed.data;
  const emailNorm = email.toLowerCase();

  if (!consumeEmailCode(emailNorm, code)) {
    return c.json({ error: "邮箱验证码错误或已过期" }, 400);
  }

  if (safeEqual(username, config.adminUsername)) {
    return c.json({ error: "用户名不可用" }, 409);
  }
  const existing = await db.query.users.findFirst({
    where: or(eq(users.username, username), eq(users.email, emailNorm)),
  });
  if (existing) {
    return c.json({ error: "用户名或邮箱已被占用" }, 409);
  }

  const portalRole = await getPortalUserRole();
  const row = {
    id: id("usr"),
    username,
    passwordHash: hashPassword(password),
    displayName: displayName?.trim() || username,
    email: emailNorm,
    role: portalRole?.name ?? "user",
    roleId: portalRole?.id ?? null,
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
      redirect: "/app/models",
    },
    201,
  );
});

authRoutes.post("/forgot-password", async (c) => {
  const schema = z.object({ email: emailSchema });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "请输入有效邮箱" }, 400);
  }
  const email = parsed.data.email.toLowerCase();
  const generic = {
    ok: true as const,
    message: "如果该邮箱已注册，我们已发送重置密码链接",
  };

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user || !user.enabled) {
    return c.json(generic);
  }

  const raw = createResetToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 60 * 60_000);
  await db.insert(passwordResets).values({
    id: id("pwr"),
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const resetUrl = `${config.publicBaseUrl.replace(/\/+$/, "")}/reset-password?token=${raw}`;
  const mail = await sendPasswordResetEmail(email, resetUrl);
  if (mailConfigured()) {
    if (!mail.sent) {
      return c.json({ error: "邮件发送失败，请稍后重试" }, 502);
    }
    return c.json(generic);
  }

  return c.json({
    ...generic,
    resetUrl,
  });
});

authRoutes.post("/reset-password", async (c) => {
  const schema = z.object({
    token: z.string().min(16).max(128),
    password: z.string().min(6).max(128),
  });
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "参数无效" }, 400);
  }
  const { token, password } = parsed.data;
  const tokenHash = hashToken(token);
  const row = await db.query.passwordResets.findFirst({
    where: and(
      eq(passwordResets.tokenHash, tokenHash),
      isNull(passwordResets.usedAt),
      gt(passwordResets.expiresAt, new Date()),
    ),
  });
  if (!row) {
    return c.json({ error: "重置链接无效或已过期" }, 400);
  }

  await db
    .update(users)
    .set({ passwordHash: hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, row.userId));
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(eq(passwordResets.id, row.id));

  return c.json({ ok: true, message: "密码已重置，请登录" });
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
    email: user.email,
    enabled: user.enabled,
    quota: unlimited ? -1 : quota,
    usedQuota,
    tokenCount: userTokens.length,
    redirect: "/app/models",
  });
});
