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
import { v1Routes } from "./routes/v1.js";
import { proxyApp } from "./routes/proxy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

migrate();

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: config.corsOrigin === "*" ? "*" : config.corsOrigin.split(","),
    allowHeaders: ["Content-Type", "Authorization", "x-api-key"],
    exposeHeaders: [
      "X-StarConverge-Channel",
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
    version: "0.1.0",
    time: new Date().toISOString(),
  }),
);

app.route("/api/admin", adminRoutes);
app.route("/v1", v1Routes);
app.route("/proxy", proxyApp);

// Serve admin SPA in production if built
const adminDist = path.resolve(__dirname, "../../admin/dist");
if (fs.existsSync(adminDist)) {
  app.use(
    "/*",
    serveStatic({
      root: path.relative(process.cwd(), adminDist),
      rewriteRequestPath: (p) => (p === "/" ? "/index.html" : p),
    }),
  );
  app.get("*", async (c) => {
    const index = path.join(adminDist, "index.html");
    if (fs.existsSync(index)) {
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
