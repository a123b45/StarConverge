import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels } from "../db/schema.js";
import { parseJsonArray, toJsonArray } from "../utils/crypto.js";

type CacheEntry = { at: number; models: string[] };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

export function modelsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
}

export async function fetchUpstreamModels(
  baseUrl: string,
  apiKey: string,
  timeoutMs = 15_000,
): Promise<string[]> {
  const url = modelsUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 20_000));
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`upstream ${res.status}: ${text.slice(0, 120)}`);
    const json = JSON.parse(text) as {
      data?: Array<{ id?: string; model?: string }>;
    };
    const ids = (json.data ?? [])
      .map((m) => m.id || m.model || "")
      .filter(Boolean);
    return [...new Set(ids)].sort();
  } finally {
    clearTimeout(timer);
  }
}

/** Explicit model names stored on channel (ignores * and empty). */
export function explicitChannelModels(modelsJson: string): string[] {
  return parseJsonArray(modelsJson).filter((m) => m && m !== "*");
}

export function isUnrestrictedModels(modelsJson: string): boolean {
  const list = parseJsonArray(modelsJson);
  return list.length === 0 || list.includes("*");
}

/**
 * Resolve model ids for a channel: use DB list when explicit,
 * otherwise fetch upstream /v1/models (cached).
 */
export async function resolveChannelModelIds(
  ch: typeof channels.$inferSelect,
  opts?: { persist?: boolean; force?: boolean },
): Promise<string[]> {
  const explicit = explicitChannelModels(ch.models);
  if (explicit.length > 0 && !opts?.force) return explicit;

  if (!opts?.force) {
    const hit = cache.get(ch.id);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.models;
  }

  try {
    const models = await fetchUpstreamModels(ch.baseUrl, ch.apiKey, ch.timeoutMs);
    cache.set(ch.id, { at: Date.now(), models });
    if (opts?.persist !== false && isUnrestrictedModels(ch.models) && models.length > 0) {
      await db
        .update(channels)
        .set({ models: toJsonArray(models), updatedAt: new Date() })
        .where(eq(channels.id, ch.id));
    }
    return models;
  } catch {
    return explicit;
  }
}

export function extractRequestPreview(bodyText: string, max = 4000): string {
  if (!bodyText) return "";
  try {
    const parsed = JSON.parse(bodyText) as {
      messages?: Array<{ role?: string; content?: unknown }>;
      prompt?: unknown;
      input?: unknown;
    };
    if (Array.isArray(parsed.messages) && parsed.messages.length) {
      const lines = parsed.messages.map((m) => {
        const content =
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content ?? "");
        return `${m.role ?? "unknown"}: ${content.slice(0, 800)}`;
      });
      return lines.join("\n").slice(0, max);
    }
    if (parsed.prompt != null) return String(parsed.prompt).slice(0, max);
    if (parsed.input != null) return String(parsed.input).slice(0, max);
  } catch {
    /* fall through */
  }
  return bodyText.slice(0, Math.min(max, 800));
}

export function extractResponsePreview(respText: string, max = 4000): string {
  if (!respText) return "";
  try {
    const parsed = JSON.parse(respText) as {
      choices?: Array<{
        message?: { content?: unknown };
        text?: string;
        delta?: { content?: unknown };
      }>;
    };
    const choice = parsed.choices?.[0];
    if (choice?.message?.content != null) {
      return String(choice.message.content).slice(0, max);
    }
    if (choice?.text) return choice.text.slice(0, max);
  } catch {
    /* fall through */
  }
  return respText.slice(0, Math.min(max, 800));
}

export function countMessages(bodyText: string): number {
  try {
    const parsed = JSON.parse(bodyText) as { messages?: unknown[] };
    return Array.isArray(parsed.messages) ? parsed.messages.length : 0;
  } catch {
    return 0;
  }
}
