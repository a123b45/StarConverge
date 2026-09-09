import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../.env") });

const root = path.resolve(__dirname, "../..");

function extractMailAddress(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] || raw).trim();
}

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
  mailFrom: (() => {
    const raw = (process.env.MAIL_FROM ?? "辉煌 <yanxueliang188@126.com>").trim();
    // Rewrite legacy sender display name left in older .env files
    return raw
      .replace(/^"?inkstudio"?(\s*<)/i, "辉煌$1")
      .replace(/^inkstudio$/i, "辉煌");
  })(),
  smtpHost: (process.env.SMTP_HOST ?? "").trim(),
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  smtpSecure: (process.env.SMTP_SECURE ?? "1") !== "0",
  smtpUser: (process.env.SMTP_USER ?? "").trim(),
  smtpPass: (process.env.SMTP_PASS ?? "").trim(),
  /**
   * Admin inbox for upstream balance / sync alerts.
   * Same mailbox as SMTP is fine (self-send on 126 works).
   */
  alertEmail: (() => {
    const explicit = (process.env.ALERT_EMAIL ?? "").trim();
    if (explicit) return explicit;
    const from = (process.env.MAIL_FROM ?? "辉煌 <yanxueliang188@126.com>").trim();
    return (
      extractMailAddress(from) ||
      (process.env.SMTP_USER ?? "").trim() ||
      "yanxueliang188@126.com"
    );
  })(),
  epayApiUrl: (process.env.EPAY_API_URL ?? "").trim(),
  epayPid: (process.env.EPAY_PID ?? "").trim(),
  epayKey: (process.env.EPAY_KEY ?? "").trim(),
  /** CNY charged per 1 USD credited */
  epayCnyPerUsd: Number(process.env.EPAY_CNY_PER_USD ?? 7.2),
  epayTypes: (process.env.EPAY_TYPES ?? "alipay,wxpay")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Kill switch for pricing auto-sync. Interval/scope live in admin settings. */
  pricingAutoSync: (process.env.PRICING_AUTO_SYNC ?? "1") !== "0",
  pricingAutoSyncHours: Math.max(
    1,
    Number(process.env.PRICING_AUTO_SYNC_HOURS ?? 4),
  ),
};
