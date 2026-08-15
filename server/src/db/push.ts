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
    role TEXT NOT NULL DEFAULT 'user',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS users_username_idx ON users(username)`,
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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  console.log("Database schema pushed.");
}
