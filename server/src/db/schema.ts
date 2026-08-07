import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("openai"), // openai | custom
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull(),
  models: text("models").notNull().default("[]"), // JSON string array
  weight: integer("weight").notNull().default(1),
  priority: integer("priority").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  timeoutMs: integer("timeout_ms").notNull().default(120_000),
  remark: text("remark").default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const tokens = sqliteTable(
  "tokens",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    /** plaintext for admin re-view; auth still uses keyHash */
    keyPlain: text("key_plain"),
    quota: integer("quota").notNull().default(-1), // -1 = unlimited
    usedQuota: integer("used_quota").notNull().default(0),
    rateLimit: integer("rate_limit").notNull().default(60), // req/min
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    allowedModels: text("allowed_models").notNull().default("[]"), // empty = all
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    remark: text("remark").default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("tokens_key_hash_idx").on(t.keyHash)],
);

export const modelRoutes = sqliteTable("model_routes", {
  id: text("id").primaryKey(),
  model: text("model").notNull().unique(),
  channelIds: text("channel_ids").notNull().default("[]"), // JSON priority list
  rewriteModel: text("rewrite_model"), // optional upstream model name
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const requestLogs = sqliteTable(
  "request_logs",
  {
    id: text("id").primaryKey(),
    tokenId: text("token_id"),
    channelId: text("channel_id"),
    model: text("model"),
    path: text("path").notNull(),
    method: text("method").notNull(),
    statusCode: integer("status_code"),
    promptTokens: integer("prompt_tokens").default(0),
    completionTokens: integer("completion_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    durationMs: integer("duration_ms"),
    ip: text("ip"),
    error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("logs_created_at_idx").on(t.createdAt),
    index("logs_token_id_idx").on(t.tokenId),
  ],
);

export const proxyRoutes = sqliteTable("proxy_routes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  pathPrefix: text("path_prefix").notNull().unique(), // e.g. /proxy/weather
  targetUrl: text("target_url").notNull(),
  authHeader: text("auth_header"), // optional Authorization to inject
  stripPrefix: integer("strip_prefix", { mode: "boolean" })
    .notNull()
    .default(true),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  requireToken: integer("require_token", { mode: "boolean" })
    .notNull()
    .default(true),
  timeoutMs: integer("timeout_ms").notNull().default(30_000),
  remark: text("remark").default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Channel = typeof channels.$inferSelect;
export type Token = typeof tokens.$inferSelect;
export type ModelRoute = typeof modelRoutes.$inferSelect;
export type RequestLog = typeof requestLogs.$inferSelect;
export type ProxyRoute = typeof proxyRoutes.$inferSelect;
