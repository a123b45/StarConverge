import Database from "better-sqlite3";
import { config } from "../config.js";
import fs from "node:fs";
import path from "node:path";

const dir = path.dirname(config.databasePath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(config.databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    email TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    role_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_login_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS users_username_idx ON users(username)`,
  // users_email_idx / users_role_id_idx created after additive ALTERs (existing DBs)
  `CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    menu_perms TEXT NOT NULL DEFAULT '[]',
    api_perms TEXT NOT NULL DEFAULT '[]',
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS roles_key_idx ON roles(key)`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id)`,
  `CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets(token_hash)`,
  `CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'openai',
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    models TEXT NOT NULL DEFAULT '[]',
    weight INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    timeout_ms INTEGER NOT NULL DEFAULT 120000,
    remark TEXT DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    key_plain TEXT,
    quota INTEGER NOT NULL DEFAULT -1,
    used_quota INTEGER NOT NULL DEFAULT 0,
    rate_limit INTEGER NOT NULL DEFAULT 60,
    enabled INTEGER NOT NULL DEFAULT 1,
    allowed_models TEXT NOT NULL DEFAULT '[]',
    group_name TEXT DEFAULT '',
    ip_allowlist TEXT NOT NULL DEFAULT '[]',
    route_ids TEXT NOT NULL DEFAULT '[]',
    concurrency INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER,
    expires_at INTEGER,
    remark TEXT DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS tokens_key_hash_idx ON tokens(key_hash)`,
  // tokens_user_id_idx is created after ensuring user_id column exists (see migrate)
  `CREATE TABLE IF NOT EXISTS model_routes (
    id TEXT PRIMARY KEY,
    model TEXT NOT NULL UNIQUE,
    channel_ids TEXT NOT NULL DEFAULT '[]',
    rewrite_model TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    published INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    token_id TEXT,
    channel_id TEXT,
    model TEXT,
    upstream_model TEXT,
    path TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    duration_ms INTEGER,
    ip TEXT,
    error TEXT,
    request_preview TEXT,
    response_preview TEXT,
    message_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS logs_created_at_idx ON request_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS logs_token_id_idx ON request_logs(token_id)`,
  `CREATE TABLE IF NOT EXISTS proxy_routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path_prefix TEXT NOT NULL UNIQUE,
    target_url TEXT NOT NULL,
    auth_header TEXT,
    strip_prefix INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    require_token INTEGER NOT NULL DEFAULT 1,
    timeout_ms INTEGER NOT NULL DEFAULT 30000,
    remark TEXT DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS model_prices (
    id TEXT PRIMARY KEY,
    external_model TEXT NOT NULL,
    global_model TEXT NOT NULL,
    provider_model TEXT DEFAULT '',
    channel_id TEXT,
    input_per_1m_cents INTEGER NOT NULL DEFAULT 0,
    output_per_1m_cents INTEGER NOT NULL DEFAULT 0,
    cache_hit_per_1m_cents INTEGER NOT NULL DEFAULT 0,
    cost_per_1m_cents INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    remark TEXT DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS model_prices_channel_idx ON model_prices(channel_id)`,
  `CREATE INDEX IF NOT EXISTS model_prices_external_idx ON model_prices(external_model)`,
];

export function migrate() {
  for (const s of statements) {
    sqlite.exec(s);
  }
  // additive migrations for existing DBs
  const cols = sqlite.prepare(`PRAGMA table_info(tokens)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "key_plain")) {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN key_plain TEXT`);
  }
  // re-read columns after possible key_plain alter
  const cols2 = sqlite.prepare(`PRAGMA table_info(tokens)`).all() as Array<{ name: string }>;
  if (!cols2.some((c) => c.name === "user_id")) {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN user_id TEXT`);
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS tokens_user_id_idx ON tokens(user_id)`);

  const tokenCols = sqlite.prepare(`PRAGMA table_info(tokens)`).all() as Array<{
    name: string;
  }>;
  if (!tokenCols.some((c) => c.name === "group_name")) {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN group_name TEXT DEFAULT ''`);
  }
  if (!tokenCols.some((c) => c.name === "ip_allowlist")) {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN ip_allowlist TEXT DEFAULT '[]'`);
  }
  if (!tokenCols.some((c) => c.name === "last_used_at")) {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN last_used_at INTEGER`);
  }
  if (!tokenCols.some((c) => c.name === "route_ids")) {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN route_ids TEXT DEFAULT '[]'`);
  }
  if (!tokenCols.some((c) => c.name === "concurrency")) {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN concurrency INTEGER DEFAULT 0`);
  }
  if (!tokenCols.some((c) => c.name === "daily_quota")) {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN daily_quota INTEGER NOT NULL DEFAULT -1`);
  }
  if (!tokenCols.some((c) => c.name === "monthly_quota")) {
    sqlite.exec(`ALTER TABLE tokens ADD COLUMN monthly_quota INTEGER NOT NULL DEFAULT -1`);
  }

  const logCols = sqlite.prepare(`PRAGMA table_info(request_logs)`).all() as Array<{
    name: string;
  }>;
  if (!logCols.some((c) => c.name === "request_preview")) {
    sqlite.exec(`ALTER TABLE request_logs ADD COLUMN request_preview TEXT`);
  }
  if (!logCols.some((c) => c.name === "response_preview")) {
    sqlite.exec(`ALTER TABLE request_logs ADD COLUMN response_preview TEXT`);
  }
  if (!logCols.some((c) => c.name === "message_count")) {
    sqlite.exec(
      `ALTER TABLE request_logs ADD COLUMN message_count INTEGER DEFAULT 0`,
    );
  }
  if (!logCols.some((c) => c.name === "upstream_model")) {
    sqlite.exec(`ALTER TABLE request_logs ADD COLUMN upstream_model TEXT`);
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS logs_model_idx ON request_logs(model)`);

  const userCols = sqlite.prepare(`PRAGMA table_info(users)`).all() as Array<{
    name: string;
  }>;
  if (!userCols.some((c) => c.name === "email")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
  }
  if (!userCols.some((c) => c.name === "role_id")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN role_id TEXT`);
  }
  if (!userCols.some((c) => c.name === "last_login_at")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN last_login_at INTEGER`);
  }
  if (!userCols.some((c) => c.name === "balance_cents")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN balance_cents INTEGER NOT NULL DEFAULT 0`);
  }
  if (!userCols.some((c) => c.name === "total_recharged_cents")) {
    sqlite.exec(
      `ALTER TABLE users ADD COLUMN total_recharged_cents INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!userCols.some((c) => c.name === "last_recharged_at")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN last_recharged_at INTEGER`);
  }
  if (!userCols.some((c) => c.name === "allowed_models")) {
    sqlite.exec(
      `ALTER TABLE users ADD COLUMN allowed_models TEXT NOT NULL DEFAULT '[]'`,
    );
  }
  if (!userCols.some((c) => c.name === "notify_read_at")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN notify_read_at INTEGER`);
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS users_role_id_idx ON users(role_id)`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS model_prices (
    id TEXT PRIMARY KEY,
    external_model TEXT NOT NULL,
    global_model TEXT NOT NULL,
    provider_model TEXT DEFAULT '',
    channel_id TEXT,
    input_per_1m_cents INTEGER NOT NULL DEFAULT 0,
    output_per_1m_cents INTEGER NOT NULL DEFAULT 0,
    cache_hit_per_1m_cents INTEGER NOT NULL DEFAULT 0,
    cost_per_1m_cents INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    remark TEXT DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS model_prices_channel_idx ON model_prices(channel_id)`,
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS model_prices_external_idx ON model_prices(external_model)`,
  );
  const priceCols = sqlite
    .prepare(`PRAGMA table_info(model_prices)`)
    .all() as Array<{ name: string }>;
  if (!priceCols.some((c) => c.name === "cache_hit_per_1m_cents")) {
    sqlite.exec(
      `ALTER TABLE model_prices ADD COLUMN cache_hit_per_1m_cents INTEGER NOT NULL DEFAULT 0`,
    );
  }
  // Upgrade stored price unit from cents (1/100 USD) to milli-USD (1/1000 USD)
  // so values like 0.025 are preserved.
  if (!priceCols.some((c) => c.name === "unit_milli")) {
    sqlite.exec(
      `ALTER TABLE model_prices ADD COLUMN unit_milli INTEGER NOT NULL DEFAULT 1`,
    );
    sqlite.exec(`UPDATE model_prices SET
      input_per_1m_cents = input_per_1m_cents * 10,
      output_per_1m_cents = output_per_1m_cents * 10,
      cache_hit_per_1m_cents = cache_hit_per_1m_cents * 10,
      cost_per_1m_cents = cost_per_1m_cents * 10
    `);
  }

  sqlite.exec(`CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id)`,
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets(token_hash)`,
  );
  sqlite.exec(`CREATE TABLE IF NOT EXISTS card_keys (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL,
    expires_at INTEGER,
    user_id TEXT,
    redeemed_at INTEGER,
    redeemed_by TEXT,
    created_by TEXT,
    remark TEXT DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS user_notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    models TEXT NOT NULL DEFAULT '[]',
    body TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS user_notifications_updated_idx ON user_notifications(updated_at)`,
  );
  sqlite.exec(`CREATE TABLE IF NOT EXISTS recharge_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    out_trade_no TEXT NOT NULL UNIQUE,
    trade_no TEXT DEFAULT '',
    pay_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    money_cny TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS recharge_orders_user_idx ON recharge_orders(user_id)`,
  );
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS recharge_orders_status_idx ON recharge_orders(status)`,
  );
  sqlite.exec(`CREATE INDEX IF NOT EXISTS card_keys_code_idx ON card_keys(code)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS card_keys_user_idx ON card_keys(user_id)`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    menu_perms TEXT NOT NULL DEFAULT '[]',
    api_perms TEXT NOT NULL DEFAULT '[]',
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS roles_key_idx ON roles(key)`);

  const mrCols = sqlite.prepare(`PRAGMA table_info(model_routes)`).all() as Array<{
    name: string;
  }>;
  if (!mrCols.some((c) => c.name === "published")) {
    sqlite.exec(
      `ALTER TABLE model_routes ADD COLUMN published INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!mrCols.some((c) => c.name === "strategy")) {
    sqlite.exec(
      `ALTER TABLE model_routes ADD COLUMN strategy TEXT NOT NULL DEFAULT 'full'`,
    );
  }
  if (!mrCols.some((c) => c.name === "targets")) {
    sqlite.exec(
      `ALTER TABLE model_routes ADD COLUMN targets TEXT NOT NULL DEFAULT '[]'`,
    );
  }
  if (!mrCols.some((c) => c.name === "smart_simple_model")) {
    sqlite.exec(`ALTER TABLE model_routes ADD COLUMN smart_simple_model TEXT`);
  }
  if (!mrCols.some((c) => c.name === "smart_complex_model")) {
    sqlite.exec(`ALTER TABLE model_routes ADD COLUMN smart_complex_model TEXT`);
  }

  // Seed default roles + backfill users without role_id
  seedDefaultRoles(sqlite);
}

function seedDefaultRoles(db: InstanceType<typeof Database>) {
  const { DEFAULT_ROLES, FIXED_KEYS } = requireRoles();
  const now = Date.now();

  for (const r of DEFAULT_ROLES) {
    const existing = db.prepare(`SELECT id FROM roles WHERE key = ?`).get(r.key) as
      | { id: string }
      | undefined;
    if (existing) {
      db.prepare(
        `UPDATE roles SET name = ?, description = ?, menu_perms = ?, api_perms = ?, is_system = 1, updated_at = ? WHERE id = ?`,
      ).run(
        r.name,
        r.description,
        JSON.stringify(r.menuPerms),
        JSON.stringify(r.apiPerms),
        now,
        existing.id,
      );
    } else {
      db.prepare(
        `INSERT INTO roles (id, key, name, description, menu_perms, api_perms, is_system, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        `role_${r.key}`,
        r.key,
        r.name,
        r.description,
        JSON.stringify(r.menuPerms),
        JSON.stringify(r.apiPerms),
        now,
        now,
      );
    }
  }

  const portal = db
    .prepare(`SELECT id FROM roles WHERE key = 'portal_user'`)
    .get() as { id: string } | undefined;
  const admin = db
    .prepare(`SELECT id FROM roles WHERE key = 'admin'`)
    .get() as { id: string } | undefined;

  if (portal) {
    db.prepare(
      `UPDATE users SET role_id = ? WHERE role_id IS NULL OR role_id = ''`,
    ).run(portal.id);

    const placeholders = FIXED_KEYS.map(() => "?").join(",");
    const extras = db
      .prepare(`SELECT id FROM roles WHERE key NOT IN (${placeholders})`)
      .all(...FIXED_KEYS) as Array<{ id: string }>;
    for (const ex of extras) {
      db.prepare(
        `UPDATE users SET role_id = ?, role = ?, updated_at = ? WHERE role_id = ?`,
      ).run(portal.id, "用户", now, ex.id);
      db.prepare(`DELETE FROM roles WHERE id = ?`).run(ex.id);
    }
  }

  if (admin) {
    db.prepare(`UPDATE users SET role = '管理员' WHERE role_id = ?`).run(admin.id);
  }
  if (portal) {
    db.prepare(`UPDATE users SET role = '用户' WHERE role_id = ?`).run(portal.id);
  }
}

function requireRoles() {
  const portalMenus = [
    "menu.portal.models",
    "menu.portal.keys",
    "menu.portal.usage",
    "menu.portal.chat",
    "menu.portal.estimate",
    "menu.portal.recharge",
    "menu.portal.bills",
    "menu.portal.docs",
  ];
  const adminMenus = [
    "menu.dashboard",
    "menu.usage",
    "menu.logs",
    "menu.channels",
    "menu.proxy",
    "menu.pricing",
    "menu.apiKeys",
    "menu.tokens",
    "menu.routes",
    "menu.customers",
    "menu.users",
    "menu.cardKeys",
    "menu.roles",
    "menu.settings",
  ];
  const adminApis = [
    "api.channels.read",
    "api.channels.write",
    "api.tokens.read",
    "api.tokens.write",
    "api.routes.read",
    "api.routes.write",
    "api.proxy.read",
    "api.proxy.write",
    "api.pricing.read",
    "api.pricing.write",
    "api.customers.read",
    "api.customers.write",
    "api.users.read",
    "api.users.write",
    "api.cardKeys.read",
    "api.cardKeys.write",
    "api.roles.read",
    "api.roles.write",
    "api.logs.read",
    "api.usage.read",
    "api.dashboard.read",
  ];
  return {
    FIXED_KEYS: ["admin", "portal_user"] as string[],
    DEFAULT_ROLES: [
      {
        key: "portal_user",
        name: "用户",
        description: "用户门户：模型、密钥、用量、对话、文档、充值与账单",
        menuPerms: portalMenus,
        apiPerms: [] as string[],
      },
      {
        key: "admin",
        name: "管理员",
        description:
          "管理端：运营（控制台/用量/日志）、资源与策略（供应商/模型/定价/路由/密钥）、系统（客户/用户/角色/文档）",
        menuPerms: adminMenus,
        apiPerms: adminApis,
      },
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  console.log("Database schema pushed.");
}
