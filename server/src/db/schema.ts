import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").default(""),
    email: text("email"),
    role: text("role").notNull().default("user"), // legacy label; prefer roleId
    roleId: text("role_id"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    /** USD balance in cents */
    balanceCents: integer("balance_cents").notNull().default(0),
    /** Cumulative recharged amount in USD cents */
    totalRechargedCents: integer("total_recharged_cents").notNull().default(0),
    lastRechargedAt: integer("last_recharged_at", { mode: "timestamp_ms" }),
    /** JSON string array of allowed model names; empty = all priced models */
    allowedModels: text("allowed_models").notNull().default("[]"),
    /** Portal notifications newer than this timestamp are unread */
    notifyReadAt: integer("notify_read_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("users_username_idx").on(t.username),
    index("users_email_idx").on(t.email),
    index("users_role_id_idx").on(t.roleId),
  ],
);

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").default(""),
    menuPerms: text("menu_perms").notNull().default("[]"),
    apiPerms: text("api_perms").notNull().default("[]"),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("roles_key_idx").on(t.key)],
);

export const passwordResets = sqliteTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("password_resets_user_idx").on(t.userId),
    index("password_resets_token_idx").on(t.tokenHash),
  ],
);

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
    userId: text("user_id"),
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
    /** Logical group label for filtering, e.g. 内部 / 客户A */
    groupName: text("group_name").default(""),
    /** JSON string array of allowed IPs/CIDRs; empty = no IP restriction */
    ipAllowlist: text("ip_allowlist").notNull().default("[]"),
    /** Bound model-route ids (JSON). When set, all allowed model calls use these routes' upstream channels; client model name is preserved. */
    routeIds: text("route_ids").notNull().default("[]"),
    /** Max concurrent in-flight requests; 0 = unlimited */
    concurrency: integer("concurrency").notNull().default(0),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    remark: text("remark").default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("tokens_key_hash_idx").on(t.keyHash),
    index("tokens_user_id_idx").on(t.userId),
  ],
);

export const modelRoutes = sqliteTable("model_routes", {
  id: text("id").primaryKey(),
  model: text("model").notNull().unique(),
  channelIds: text("channel_ids").notNull().default("[]"), // JSON priority list (legacy / derived)
  rewriteModel: text("rewrite_model"), // optional upstream model name (legacy / first target)
  /** full | random | ratio | smart */
  strategy: text("strategy").notNull().default("full"),
  /**
   * JSON targets: { channelId, upstreamModel, weight }[]
   * weight used by ratio strategy (relative).
   */
  targets: text("targets").notNull().default("[]"),
  /** smart strategy: upstream model for short input */
  smartSimpleModel: text("smart_simple_model"),
  /** smart strategy: upstream model for long/complex input */
  smartComplexModel: text("smart_complex_model"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** When true, model appears in user portal + /v1/models */
  published: integer("published", { mode: "boolean" }).notNull().default(false),
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
    /** Upstream model actually sent to provider (bound-route / rewrite); null = same as model */
    upstreamModel: text("upstream_model"),
    path: text("path").notNull(),
    method: text("method").notNull(),
    statusCode: integer("status_code"),
    promptTokens: integer("prompt_tokens").default(0),
    completionTokens: integer("completion_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    durationMs: integer("duration_ms"),
    ip: text("ip"),
    error: text("error"),
    /** Truncated request payload preview (chat messages / prompt) */
    requestPreview: text("request_preview"),
    /** Truncated response content preview */
    responsePreview: text("response_preview"),
    messageCount: integer("message_count").default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("logs_created_at_idx").on(t.createdAt),
    index("logs_token_id_idx").on(t.tokenId),
    index("logs_model_idx").on(t.model),
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

/** Model sell/cost prices bound to a provider (channel) account.
 *  Amounts stored as milli-USD (1/1000 USD) per 1M tokens — 3 decimal places. */
export const modelPrices = sqliteTable(
  "model_prices",
  {
    id: text("id").primaryKey(),
    externalModel: text("external_model").notNull(),
    globalModel: text("global_model").notNull(),
    providerModel: text("provider_model").default(""),
    channelId: text("channel_id"),
    inputPer1mCents: integer("input_per_1m_cents").notNull().default(0),
    outputPer1mCents: integer("output_per_1m_cents").notNull().default(0),
    cacheHitPer1mCents: integer("cache_hit_per_1m_cents").notNull().default(0),
    costPer1mCents: integer("cost_per_1m_cents").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    remark: text("remark").default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("model_prices_channel_idx").on(t.channelId),
    index("model_prices_external_idx").on(t.externalModel),
  ],
);

/** Prepaid redeem codes that add USD balance. */
export const cardKeys = sqliteTable(
  "card_keys",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    amountCents: integer("amount_cents").notNull(),
    /** Unused card expires at; null = never */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    /** When set, only this user may redeem */
    userId: text("user_id"),
    redeemedAt: integer("redeemed_at", { mode: "timestamp_ms" }),
    redeemedBy: text("redeemed_by"),
    createdBy: text("created_by"),
    remark: text("remark").default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("card_keys_code_idx").on(t.code),
    index("card_keys_user_idx").on(t.userId),
  ],
);

/** Broadcast events shown in the user portal notification bell. */
export const userNotifications = sqliteTable(
  "user_notifications",
  {
    id: text("id").primaryKey(),
    /** models | pricing */
    type: text("type").notNull(),
    models: text("models").notNull().default("[]"),
    body: text("body").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("user_notifications_updated_idx").on(t.updatedAt)],
);

/** JSON blobs for admin-configurable jobs (pricing auto-sync, etc.). */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default("{}"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Token = typeof tokens.$inferSelect;
export type ModelRoute = typeof modelRoutes.$inferSelect;
export type RequestLog = typeof requestLogs.$inferSelect;
export type ProxyRoute = typeof proxyRoutes.$inferSelect;
export type ModelPrice = typeof modelPrices.$inferSelect;
export const rechargeOrders = sqliteTable(
  "recharge_orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    outTradeNo: text("out_trade_no").notNull().unique(),
    tradeNo: text("trade_no").default(""),
    /** alipay | wxpay | qqpay */
    payType: text("pay_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    moneyCny: text("money_cny").notNull(),
    /** pending | paid | closed */
    status: text("status").notNull().default("pending"),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("recharge_orders_user_idx").on(t.userId),
    index("recharge_orders_status_idx").on(t.status),
  ],
);

export type CardKey = typeof cardKeys.$inferSelect;
export type UserNotification = typeof userNotifications.$inferSelect;
export type RechargeOrder = typeof rechargeOrders.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
