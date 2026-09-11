/**
 * Prepaid inventory on NewAPI-compatible upstreams.
 * Customer wallet on this site is a different ledger.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { upstreamAccounts } from "../db/schema.js";
import { config } from "../config.js";
import { mailConfigured, sendMail } from "./mail.js";
import { parseJsonArray, toJsonArray } from "../utils/crypto.js";

/** NewAPI: 1 currency unit remaining == 500_000 quota points. */
export const UPSTREAM_QUOTA_PER_USD = 500_000;
export const UPSTREAM_POLL_MS = 5 * 60 * 1000;
/** Don't re-mail the same low-balance / error condition more often than this. */
const ALERT_EMAIL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type UpstreamCurrency = "cny" | "usd";

export type UpstreamAccount = typeof upstreamAccounts.$inferSelect;

/**
 * Collapse upstream error text into a mute key so "Conflict" / "409 Conflict"
 * are treated as the same class.
 */
export function upstreamErrorMuteKey(error: string): string {
  const t = error.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return "";
  if (/\bconflict\b/.test(t) || /^409\b/.test(t)) return "conflict";
  if (/\bunauthorized\b|\b401\b/.test(t)) return "unauthorized";
  if (/\bforbidden\b|\b403\b/.test(t)) return "forbidden";
  if (/\btimeout\b|超时/.test(t)) return "timeout";
  return t.slice(0, 120);
}

export function mutedErrorKeysOf(row: UpstreamAccount): string[] {
  return parseJsonArray(row.mutedErrorKeys ?? "[]")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

export function isUpstreamErrorMuted(row: UpstreamAccount, error?: string | null): boolean {
  const err = (error ?? row.lastError ?? "").trim();
  if (!err) return false;
  const key = upstreamErrorMuteKey(err);
  if (!key) return false;
  return mutedErrorKeysOf(row).includes(key);
}

export type UpstreamAlert = {
  id: string;
  name: string;
  username: string;
  baseUrl: string;
  balanceCurrency: UpstreamCurrency;
  balanceUsd: number;
  thresholdUsd: number;
  lastCheckedAt: string | null;
};

export function normalizeUpstreamCurrency(raw: unknown): UpstreamCurrency {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "usd" || v === "dollar" || v === "$" || v === "美元") return "usd";
  return "cny";
}

export function normalizeUpstreamOrigin(raw: string): string {
  const trimmed = raw.trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withProto);
  return `${u.protocol}//${u.host}`;
}

export function quotaToUsdMilli(quota: number): number {
  if (!Number.isFinite(quota)) return 0;
  return Math.round((quota / UPSTREAM_QUOTA_PER_USD) * 1000);
}

export function usdToMilli(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0;
  return Math.round(usd * 1000);
}

export function milliToUsd(milli: number | null | undefined): number {
  return (Number(milli) || 0) / 1000;
}

function maskPassword(value: string): string {
  if (!value) return "";
  return "••••••••";
}

export function publicUpstreamAccount(row: UpstreamAccount) {
  const balanceCurrency = normalizeUpstreamCurrency(row.balanceCurrency);
  const balanceUsd = milliToUsd(row.lastBalanceUsdMilli);
  const thresholdUsd = milliToUsd(row.alertThresholdUsdMilli);
  const convertToCny = balanceCurrency !== "cny";
  const balanceCny = convertToCny
    ? Math.round(balanceUsd * config.epayCnyPerUsd * 10000) / 10000
    : balanceUsd;
  const low =
    row.alertEnabled &&
    row.enabled &&
    row.lastBalanceUsdMilli != null &&
    row.lastBalanceUsdMilli < row.alertThresholdUsdMilli;
  const lastError = row.lastError || "";
  const mutedErrorKeys = mutedErrorKeysOf(row);
  const errorMuted = isUpstreamErrorMuted(row, lastError);
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    username: row.username,
    passwordSet: Boolean(row.password),
    password: maskPassword(row.password),
    enabled: row.enabled,
    alertEnabled: row.alertEnabled,
    alertThresholdUsd: thresholdUsd,
    lastQuota: row.lastQuota,
    balanceCurrency,
    convertToCny,
    balanceUsd,
    balanceCny,
    lastCheckedAt: row.lastCheckedAt ? new Date(row.lastCheckedAt).toISOString() : null,
    lastError,
    mutedErrorKeys,
    errorMuted,
    low,
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function pickQuota(payload: unknown): number | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const user = asRecord(data?.user) ?? data;
  const quota = Number(user?.quota);
  if (!Number.isFinite(quota)) return null;
  return quota;
}

function pickToken(payload: unknown): string | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const token = data?.token;
  return typeof token === "string" && token ? token : null;
}

function pickUserId(payload: unknown): string | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const user = asRecord(data?.user) ?? data;
  if (user?.id == null) return null;
  return String(user.id);
}

function cookieHeader(setCookies: string[]): string {
  const parts: string[] = [];
  for (const line of setCookies) {
    const pair = line.split(";")[0]?.trim();
    if (pair) parts.push(pair);
  }
  return parts.join("; ");
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<{ json: unknown; cookies: string[] }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const cookies =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (asRecord(json)?.message as string) ||
        (asRecord(json)?.error as string) ||
        `HTTP ${res.status}`;
      throw new Error(msg);
    }
    const ok = asRecord(json)?.success;
    if (ok === false) {
      throw new Error(String(asRecord(json)?.message || "上游返回失败"));
    }
    return { json, cookies };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchUpstreamBalance(row: UpstreamAccount): Promise<{
  quota: number;
  usdMilli: number;
}> {
  if (!row.username || !row.password) {
    throw new Error("未填写上游账户或密码");
  }
  const origin = normalizeUpstreamOrigin(row.baseUrl);
  const login = await fetchJson(`${origin}/api/user/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: row.username, password: row.password }),
  });
  const token = pickToken(login.json);
  const userId = pickUserId(login.json);
  const cookie = cookieHeader(login.cookies);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (userId) headers["new-api-user"] = userId;
  if (cookie) headers.cookie = cookie;

  let quota = pickQuota(login.json);
  try {
    const self = await fetchJson(`${origin}/api/user/self`, {
      method: "GET",
      headers,
    });
    quota = pickQuota(self.json) ?? quota;
  } catch {
    // login payload sometimes already includes quota
  }
  if (quota == null) throw new Error("上游未返回额度");
  return { quota, usdMilli: quotaToUsdMilli(quota) };
}

export async function refreshUpstreamAccount(id: string): Promise<UpstreamAccount> {
  const row = await db.query.upstreamAccounts.findFirst({
    where: eq(upstreamAccounts.id, id),
  });
  if (!row) throw new Error("Not found");
  try {
    const { quota, usdMilli } = await fetchUpstreamBalance(row);
    const now = new Date();
    await db
      .update(upstreamAccounts)
      .set({
        lastQuota: quota,
        lastBalanceUsdMilli: usdMilli,
        lastCheckedAt: now,
        lastError: "",
        lastErrorEmailAt: null,
        updatedAt: now,
      })
      .where(eq(upstreamAccounts.id, id));
  } catch (err) {
    const now = new Date();
    await db
      .update(upstreamAccounts)
      .set({
        lastError: err instanceof Error ? err.message : "同步失败",
        lastCheckedAt: now,
        updatedAt: now,
      })
      .where(eq(upstreamAccounts.id, id));
  }
  const next = await db.query.upstreamAccounts.findFirst({
    where: eq(upstreamAccounts.id, id),
  });
  if (!next) throw new Error("Not found");
  await maybeEmailUpstreamAlert(next);
  return next;
}

function moneyLabel(row: UpstreamAccount, amount: number): string {
  const cur = normalizeUpstreamCurrency(row.balanceCurrency);
  if (cur === "usd") return `$${amount.toFixed(3)}`;
  return `¥${amount.toFixed(3)}`;
}

function cooledDown(last: Date | null | undefined, now = Date.now()): boolean {
  if (!last) return true;
  return now - new Date(last).getTime() >= ALERT_EMAIL_COOLDOWN_MS;
}

async function maybeEmailUpstreamAlert(row: UpstreamAccount): Promise<void> {
  if (!row.enabled || !row.alertEnabled) return;
  if (!mailConfigured() || !config.alertEmail) return;

  const error = (row.lastError || "").trim();
  if (error) {
    if (isUpstreamErrorMuted(row, error)) return;
    if (!cooledDown(row.lastErrorEmailAt)) return;
    const subject = `【辉煌】上游同步失败：${row.name}`;
    const html = `
      <p>上游账户同步失败，请尽快检查。</p>
      <ul>
        <li>名称：${escapeHtml(row.name)}</li>
        <li>账户：${escapeHtml(row.username)}</li>
        <li>网址：${escapeHtml(row.baseUrl)}</li>
        <li>错误：${escapeHtml(error)}</li>
      </ul>
      <p style="color:#888;font-size:12px">同一故障约 6 小时内不会重复发送。可在上游管理中屏蔽此类告警。</p>
    `;
    const res = await sendMail(config.alertEmail, subject, html);
    if (res.sent) {
      await db
        .update(upstreamAccounts)
        .set({ lastErrorEmailAt: new Date(), updatedAt: new Date() })
        .where(eq(upstreamAccounts.id, row.id));
    }
    return;
  }

  const low =
    row.lastBalanceUsdMilli != null &&
    row.lastBalanceUsdMilli < row.alertThresholdUsdMilli;
  if (!low) {
    if (row.lastAlertEmailAt) {
      await db
        .update(upstreamAccounts)
        .set({ lastAlertEmailAt: null, updatedAt: new Date() })
        .where(eq(upstreamAccounts.id, row.id));
    }
    return;
  }

  if (!cooledDown(row.lastAlertEmailAt)) return;

  const balance = milliToUsd(row.lastBalanceUsdMilli);
  const threshold = milliToUsd(row.alertThresholdUsdMilli);
  const subject = `【辉煌】上游余额告警：${row.name}`;
  const html = `
    <p>上游预付余额已低于告警阈值，请及时充值。</p>
    <ul>
      <li>名称：${escapeHtml(row.name)}</li>
      <li>账户：${escapeHtml(row.username)}</li>
      <li>网址：${escapeHtml(row.baseUrl)}</li>
      <li>当前余额：${escapeHtml(moneyLabel(row, balance))}</li>
      <li>告警阈值：${escapeHtml(moneyLabel(row, threshold))}</li>
    </ul>
    <p style="color:#888;font-size:12px">余额恢复后会重置；持续偏低时约每 6 小时提醒一次。</p>
  `;
  const res = await sendMail(config.alertEmail, subject, html);
  if (res.sent) {
    await db
      .update(upstreamAccounts)
      .set({ lastAlertEmailAt: new Date(), updatedAt: new Date() })
      .where(eq(upstreamAccounts.id, row.id));
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function muteUpstreamError(
  id: string,
  opts: { error?: string; unmute?: boolean } = {},
): Promise<UpstreamAccount> {
  const row = await db.query.upstreamAccounts.findFirst({
    where: eq(upstreamAccounts.id, id),
  });
  if (!row) throw new Error("Not found");
  const raw = (opts.error ?? row.lastError ?? "").trim();
  if (!raw && !opts.unmute) throw new Error("没有可屏蔽的错误");
  const key = upstreamErrorMuteKey(raw || (opts.error ?? ""));
  let keys = mutedErrorKeysOf(row);
  if (opts.unmute) {
    if (key) keys = keys.filter((k) => k !== key);
    else keys = [];
  } else {
    if (!key) throw new Error("没有可屏蔽的错误");
    if (!keys.includes(key)) keys = [...keys, key];
  }
  await db
    .update(upstreamAccounts)
    .set({
      mutedErrorKeys: toJsonArray(keys),
      lastErrorEmailAt: opts.unmute ? row.lastErrorEmailAt : null,
      updatedAt: new Date(),
    })
    .where(eq(upstreamAccounts.id, id));
  const next = await db.query.upstreamAccounts.findFirst({
    where: eq(upstreamAccounts.id, id),
  });
  if (!next) throw new Error("Not found");
  return next;
}

export async function refreshAllUpstreamAccounts(): Promise<void> {
  const rows = await db.select().from(upstreamAccounts);
  for (const row of rows.filter((r) => r.enabled)) {
    await refreshUpstreamAccount(row.id);
  }
}

export async function listUpstreamAlerts(): Promise<UpstreamAlert[]> {
  const rows = await db.select().from(upstreamAccounts);
  return rows
    .filter(
      (r) =>
        r.enabled &&
        r.alertEnabled &&
        r.lastBalanceUsdMilli != null &&
        r.lastBalanceUsdMilli < r.alertThresholdUsdMilli,
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      username: r.username,
      baseUrl: r.baseUrl,
      balanceCurrency: normalizeUpstreamCurrency(r.balanceCurrency),
      balanceUsd: milliToUsd(r.lastBalanceUsdMilli),
      thresholdUsd: milliToUsd(r.alertThresholdUsdMilli),
      lastCheckedAt: r.lastCheckedAt ? new Date(r.lastCheckedAt).toISOString() : null,
    }));
}

export function startUpstreamBalanceSync() {
  void refreshAllUpstreamAccounts().catch((e) =>
    console.warn("[upstream-inventory]", e instanceof Error ? e.message : e),
  );
  setInterval(() => {
    void refreshAllUpstreamAccounts().catch((e) =>
      console.warn("[upstream-inventory]", e instanceof Error ? e.message : e),
    );
  }, UPSTREAM_POLL_MS);
}
