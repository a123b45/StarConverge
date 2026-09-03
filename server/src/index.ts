import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { config } from "./config.js";
import { migrate } from "./db/push.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { portalRoutes } from "./routes/portal.js";
import { v1Routes } from "./routes/v1.js";
import { proxyApp } from "./routes/proxy.js";
import { payRoutes } from "./routes/pay.js";
import { startPricingAutoSync } from "./services/pricing-sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

migrate();

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: config.corsOrigin === "*" ? "*" : config.corsOrigin.split(","),
    allowHeaders: ["Content-Type", "Authorization", "x-api-key", "anthropic-version", "anthropic-beta"],
    exposeHeaders: [
      "X-StarConverge-Channel",
      "X-StarConverge-Bound-Route",
      "X-StarConverge-Proxy",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
    ],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    name: "StarConverge",
    version: "0.2.0",
    time: new Date().toISOString(),
  }),
);

app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/portal", portalRoutes);
app.route("/api/pay", payRoutes);
app.route("/v1", v1Routes);
app.route("/proxy", proxyApp);

// Serve admin SPA in production if built.
// Use absolute paths — serveStatic's relative root breaks when cwd ≠ repo root,
// and a blind SPA fallback would return index.html for missing /assets/*.css.
const adminDist = path.resolve(__dirname, "../../admin/dist");
const mimeByExt: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function safeJoin(root: string, reqPath: string): string | null {
  const cleaned = decodeURIComponent(reqPath.split("?")[0] ?? "").replace(
    /^\/+/,
    "",
  );
  if (!cleaned || cleaned.includes("\0")) return null;
  const full = path.resolve(root, cleaned);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

if (fs.existsSync(adminDist)) {
  app.get("/assets/*", async (c) => {
    const rel = c.req.path.replace(/^\/assets\//, "assets/");
    const full = safeJoin(adminDist, rel);
    if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return c.text("Not found", 404);
    }
    const ext = path.extname(full).toLowerCase();
    c.header("Content-Type", mimeByExt[ext] ?? "application/octet-stream");
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    return c.body(fs.readFileSync(full));
  });

  // Optional: other static files at dist root (favicon, etc.)
  app.use(
    "/*",
    serveStatic({
      root: adminDist,
      rewriteRequestPath: (p) => p,
    }),
  );

  app.get("*", async (c) => {
    const p = c.req.path;
    if (
      p.startsWith("/api/") ||
      p.startsWith("/v1/") ||
      p.startsWith("/proxy/") ||
      p.startsWith("/assets/") ||
      p === "/health"
    ) {
      return c.text("Not found", 404);
    }
    const index = path.join(adminDist, "index.html");
    if (fs.existsSync(index)) {
      c.header("Cache-Control", "no-cache");
      return c.html(fs.readFileSync(index, "utf8"));
    }
    return c.text("Admin UI not found", 404);
  });
} else {
  app.get("/", (c) =>
    c.json({
      name: "StarConverge",
      message: "API relay is running. Admin UI: pnpm dev:admin",
      endpoints: {
        health: "/health",
        openai: "/v1/*",
        proxy: "/proxy/*",
        admin: "/api/admin/*",
      },
    }),
  );
}

console.log(`StarConverge listening on http://${config.host}:${config.port}`);
serve({ fetch: app.fetch, port: config.port, hostname: config.host });
startPricingAutoSync();
