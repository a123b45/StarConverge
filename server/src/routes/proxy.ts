import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { proxyRoutes, tokens, type Token } from "../db/schema.js";
import { extractBearer, hashKey } from "../utils/crypto.js";
import { checkRateLimit } from "../services/rate-limit.js";
import { writeLog } from "../services/stats.js";
import { getRequestClientIp } from "../utils/client-ip.js";

export const proxyApp = new Hono();

async function authenticateToken(c: {
  req: { header: (name: string) => string | undefined };
}): Promise<{ token: Token } | { error: Response }> {
  const raw =
    extractBearer(c.req.header("Authorization")) ??
    c.req.header("x-api-key") ??
    null;
  if (!raw) {
    return {
      error: Response.json(
        { error: { message: "Missing API key", type: "auth_error" } },
        { status: 401 },
      ),
    };
  }
  const row = await db.query.tokens.findFirst({
    where: eq(tokens.keyHash, hashKey(raw)),
  });
  if (!row || !row.enabled) {
    return {
      error: Response.json(
        { error: { message: "Invalid API key", type: "auth_error" } },
        { status: 401 },
      ),
    };
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return {
      error: Response.json(
        { error: { message: "API key expired", type: "auth_error" } },
        { status: 401 },
      ),
    };
  }
  if (row.quota >= 0 && row.usedQuota >= row.quota) {
    return {
      error: Response.json(
        { error: { message: "Quota exceeded", type: "quota_error" } },
        { status: 429 },
      ),
    };
  }
  const rl = checkRateLimit(`token:${row.id}`, row.rateLimit);
  if (!rl.ok) {
    return {
      error: Response.json(
        { error: { message: "Rate limit exceeded", type: "rate_limit_error" } },
        { status: 429 },
      ),
    };
  }
  return { token: row };
}

proxyApp.all("/*", async (c) => {
  const path = c.req.path;
  const routes = await db
    .select()
    .from(proxyRoutes)
    .where(eq(proxyRoutes.enabled, true));

  const matched = routes
    .filter(
      (r) =>
        path === r.pathPrefix ||
        path.startsWith(r.pathPrefix.replace(/\/?$/, "/")),
    )
    .sort((a, b) => b.pathPrefix.length - a.pathPrefix.length)[0];

  if (!matched) {
    return c.json(
      { error: { message: "No proxy route matched", type: "not_found_error" } },
      404,
    );
  }

  let token: Token | undefined;
  if (matched.requireToken) {
    const auth = await authenticateToken(c);
    if ("error" in auth) return auth.error;
    token = auth.token;
  }

  const started = Date.now();
  let rest = path;
  if (matched.stripPrefix) {
    rest = path.slice(matched.pathPrefix.length) || "/";
    if (!rest.startsWith("/")) rest = `/${rest}`;
  }

  const targetBase = matched.targetUrl.replace(/\/+$/, "");
  const url = new URL(c.req.url);
  const target = `${targetBase}${rest}${url.search}`;

  const headers = new Headers();
  c.req.raw.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    if (["host", "connection", "content-length", "authorization"].includes(key))
      return;
    headers.set(k, v);
  });
  if (matched.authHeader) {
    headers.set("Authorization", matched.authHeader);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), matched.timeoutMs);
  try {
    const body =
      c.req.method === "GET" || c.req.method === "HEAD"
        ? undefined
        : await c.req.arrayBuffer();
    const upstream = await fetch(target, {
      method: c.req.method,
      headers,
      body,
      signal: controller.signal,
    });
    const buf = await upstream.arrayBuffer();
    clearTimeout(timer);

    await writeLog({
      tokenId: token?.id,
      path,
      method: c.req.method,
      statusCode: upstream.status,
      durationMs: Date.now() - started,
      ip: getRequestClientIp(c),
    });

    const outHeaders: Record<string, string> = {
      "X-StarConverge-Proxy": matched.name,
    };
    const ct = upstream.headers.get("content-type");
    if (ct) outHeaders["Content-Type"] = ct;

    return c.body(buf, upstream.status as 200, outHeaders);
  } catch (err) {
    clearTimeout(timer);
    await writeLog({
      tokenId: token?.id,
      path,
      method: c.req.method,
      statusCode: 502,
      durationMs: Date.now() - started,
      ip: getRequestClientIp(c),
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      {
        error: {
          message: err instanceof Error ? err.message : "proxy failed",
          type: "api_error",
        },
      },
      502,
    );
  }
});
