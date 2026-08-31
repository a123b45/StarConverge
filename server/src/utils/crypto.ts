import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
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

const cardAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 5);

export function generateCardCode(): string {
  return `SC-${cardAlphabet()}-${cardAlphabet()}-${cardAlphabet()}-${cardAlphabet()}`;
}

export function normalizeCardCode(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = compact.startsWith("SC") ? compact.slice(2) : compact;
  if (body.length !== 20) return compact;
  return `SC-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-${body.slice(15, 20)}`;
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

export function md5(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

export function nowMs(): number {
  return Date.now();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
