/** Simple in-memory sliding window rate limiter */
const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limitPerMinute: number,
): { ok: boolean; remaining: number; resetMs: number } {
  if (limitPerMinute <= 0) {
    return { ok: true, remaining: Infinity, resetMs: 0 };
  }
  const now = Date.now();
  const windowMs = 60_000;
  const stamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (stamps.length >= limitPerMinute) {
    buckets.set(key, stamps);
    const resetMs = windowMs - (now - stamps[0]!);
    return { ok: false, remaining: 0, resetMs };
  }
  stamps.push(now);
  buckets.set(key, stamps);
  return {
    ok: true,
    remaining: Math.max(0, limitPerMinute - stamps.length),
    resetMs: windowMs,
  };
}

// periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, stamps] of buckets) {
    const next = stamps.filter((t) => now - t < 60_000);
    if (next.length === 0) buckets.delete(k);
    else buckets.set(k, next);
  }
}, 60_000).unref?.();
