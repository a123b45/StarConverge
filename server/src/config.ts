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
  adminPassword: process.env.ADMIN_PASSWORD ?? "123456",
  adminJwtSecret:
    process.env.ADMIN_JWT_SECRET ?? "starconverge-change-me-in-production",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  defaultRateLimit: Number(process.env.DEFAULT_RATE_LIMIT ?? 60),
  logLevel: process.env.LOG_LEVEL ?? "info",
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ??
    (process.env.PUBLIC_HOST
      ? `https://${String(process.env.PUBLIC_HOST).replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
      : `http://127.0.0.1:${Number(process.env.PORT ?? 8787)}`),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  mailFrom:
    process.env.MAIL_FROM ??
    "inkstudio <yanxueliang188@126.com>",
  smtpHost: (process.env.SMTP_HOST ?? "").trim(),
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  smtpSecure: (process.env.SMTP_SECURE ?? "1") !== "0",
  smtpUser: (process.env.SMTP_USER ?? "").trim(),
  smtpPass: (process.env.SMTP_PASS ?? "").trim(),
  epayApiUrl: (process.env.EPAY_API_URL ?? "").trim(),
  epayPid: (process.env.EPAY_PID ?? "").trim(),
  epayKey: (process.env.EPAY_KEY ?? "").trim(),
  /** CNY charged per 1 USD credited */
  epayCnyPerUsd: Number(process.env.EPAY_CNY_PER_USD ?? 7.2),
  epayTypes: (process.env.EPAY_TYPES ?? "alipay,wxpay")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Daily NewAPI /api/pricing sync for all compatible channels */
  pricingAutoSync: (process.env.PRICING_AUTO_SYNC ?? "1") !== "0",
  pricingAutoSyncHours: Math.max(
    1,
    Number(process.env.PRICING_AUTO_SYNC_HOURS ?? 24),
  ),
};
