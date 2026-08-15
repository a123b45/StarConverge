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
  `CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)`,
  `CREATE INDEX IF NOT EXISTS users_role_id_idx ON users(role_id)`,
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
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    token_id TEXT,
    channel_id TEXT,
    model TEXT,
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
  sqlite.exec(`CREATE INDEX IF NOT EXISTS logs_model_idx ON request_logs(model)`);

  const userCols = sqlite.prepare(`PRAGMA table_info(users)`).all() as Array<{
    name: string;
  }>;
  if (!userCols.some((c) => c.name === "email")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)`);
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

  const userCols2 = sqlite.prepare(`PRAGMA table_info(users)`).all() as Array<{
    name: string;
  }>;
  if (!userCols2.some((c) => c.name === "role_id")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN role_id TEXT`);
  }
  if (!userCols2.some((c) => c.name === "last_login_at")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN last_login_at INTEGER`);
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS users_role_id_idx ON users(role_id)`);
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

  // Seed default roles + backfill users without role_id
  seedDefaultRoles(sqlite);
}

function seedDefaultRoles(db: InstanceType<typeof Database>) {
  const { DEFAULT_ROLES } = requireRoles();
  for (const r of DEFAULT_ROLES) {
    const existing = db.prepare(`SELECT id FROM roles WHERE key = ?`).get(r.key) as
      | { id: string }
      | undefined;
    if (existing) continue;
    const rid = `role_${r.key}`;
    db.prepare(
      `INSERT INTO roles (id, key, name, description, menu_perms, api_perms, is_system, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      rid,
      r.key,
      r.name,
      r.description,
      JSON.stringify(r.menuPerms),
      JSON.stringify(r.apiPerms),
      Date.now(),
      Date.now(),
    );
  }
  const portal = db
    .prepare(`SELECT id FROM roles WHERE key = 'portal_user'`)
    .get() as { id: string } | undefined;
  if (portal) {
    db.prepare(
      `UPDATE users SET role_id = ? WHERE role_id IS NULL OR role_id = ''`,
    ).run(portal.id);
  }
}

function requireRoles() {
  // inline to avoid circular ESM issues in migrate script
  return {
    DEFAULT_ROLES: [
      {
        key: "portal_user",
        name: "普通用户",
        description: "仅可访问用户门户",
        menuPerms: [
          "menu.portal.models",
          "menu.portal.keys",
          "menu.portal.usage",
          "menu.portal.chat",
          "menu.portal.docs",
        ],
        apiPerms: [] as string[],
      },
      {
        key: "operator",
        name: "运营人员",
        description: "查看运营数据与供应商，不可改用户与角色",
        menuPerms: [
          "menu.dashboard",
          "menu.usage",
          "menu.logs",
          "menu.channels",
          "menu.tokens",
          "menu.routes",
          "menu.proxy",
          "menu.settings",
        ],
        apiPerms: [
          "api.dashboard.read",
          "api.usage.read",
          "api.logs.read",
          "api.channels.read",
          "api.channels.write",
          "api.tokens.read",
          "api.tokens.write",
          "api.routes.read",
          "api.routes.write",
          "api.proxy.read",
          "api.proxy.write",
        ],
      },
      {
        key: "admin",
        name: "管理员",
        description: "管理端全部菜单与接口权限",
        menuPerms: [
          "menu.dashboard",
          "menu.usage",
          "menu.logs",
          "menu.channels",
          "menu.tokens",
          "menu.routes",
          "menu.proxy",
          "menu.users",
          "menu.roles",
          "menu.settings",
        ],
        apiPerms: [
          "api.channels.read",
          "api.channels.write",
          "api.tokens.read",
          "api.tokens.write",
          "api.routes.read",
          "api.routes.write",
          "api.proxy.read",
          "api.proxy.write",
          "api.users.read",
          "api.users.write",
          "api.roles.read",
          "api.roles.write",
          "api.logs.read",
          "api.usage.read",
          "api.dashboard.read",
        ],
      },
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  console.log("Database schema pushed.");
}
