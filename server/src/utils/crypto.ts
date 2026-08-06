import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { customAlphabet } from "nanoid";

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

export function id(prefix = ""): string {
  return prefix ? `${prefix}_${nano()}` : nano();
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = `sk-sc-${randomBytes(24).toString("base64url")}`;
  return {
    key: raw,
    prefix: raw.slice(0, 12),
    hash: hashKey(raw),
  };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function toJsonArray(value: string[]): string {
  return JSON.stringify(value);
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

export function nowMs(): number {
  return Date.now();
}
