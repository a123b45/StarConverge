/**
 * Prepaid inventory on NewAPI-compatible upstreams.
 * Customer wallet on this site is a different ledger.
 */

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { upstreamAccounts } from "../db/schema.js";
import { config } from "../config.js";

/** NewAPI: $1 remaining == 500_000 quota points. */
export const UPSTREAM_QUOTA_PER_USD = 500_000;
export const UPSTREAM_POLL_MS = 5 * 60 * 1000;

export type UpstreamAccount = typeof upstreamAccounts.$inferSelect;

export type UpstreamAlert = {
  id: string;
  name: string;
  username: string;
  baseUrl: string;
  balanceUsd: number;
  thresholdUsd: number;
  lastCheckedAt: string | null;
};

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
  const balanceUsd = milliToUsd(row.lastBalanceUsdMilli);
  const thresholdUsd = milliToUsd(row.alertThresholdUsdMilli);
  const low =
    row.alertEnabled &&
    row.enabled &&
    row.lastBalanceUsdMilli != null &&
    row.lastBalanceUsdMilli < row.alertThresholdUsdMilli;
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
    balanceUsd,
    balanceCny: Math.round(balanceUsd * config.epayCnyPerUsd * 10000) / 10000,
    lastCheckedAt: row.lastCheckedAt ? new Date(row.lastCheckedAt).toISOString() : null,
    lastError: row.lastError || "",
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
