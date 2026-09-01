import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const TTL_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
const MAX_TRIES = 5;

type CodeRow = { hash: string; expires: number; tries: number };
const codes = new Map<string, CodeRow>();
const lastSend = new Map<string, number>();

function prune() {
  const now = Date.now();
  for (const [k, v] of codes) {
    if (v.expires <= now) codes.delete(k);
  }
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}\0${code}`).digest();
}

export function remainingSendCooldown(email: string): number {
  const last = lastSend.get(email) ?? 0;
  const wait = COOLDOWN_MS - (Date.now() - last);
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

export function issueEmailCode(email: string): string {
  prune();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  codes.set(email, {
    hash: hashCode(email, code).toString("hex"),
    expires: Date.now() + TTL_MS,
    tries: 0,
  });
  lastSend.set(email, Date.now());
  return code;
}

export function consumeEmailCode(email: string, code: string): boolean {
  prune();
  const row = codes.get(email);
  if (!row || row.expires <= Date.now()) {
    codes.delete(email);
    return false;
  }
  row.tries += 1;
  const got = hashCode(email, code.trim());
  const want = Buffer.from(row.hash, "hex");
  const ok = got.length === want.length && timingSafeEqual(got, want);
  if (ok) {
    codes.delete(email);
    return true;
  }
  if (row.tries >= MAX_TRIES) codes.delete(email);
  return false;
}
