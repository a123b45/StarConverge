import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../.env") });

const root = path.resolve(__dirname, "../..");

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",
  databasePath:
    process.env.DATABASE_PATH ?? path.join(root, "data", "starconverge.db"),
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin123",
  adminJwtSecret:
    process.env.ADMIN_JWT_SECRET ?? "starconverge-change-me-in-production",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  defaultRateLimit: Number(process.env.DEFAULT_RATE_LIMIT ?? 60),
  logLevel: process.env.LOG_LEVEL ?? "info",
};
