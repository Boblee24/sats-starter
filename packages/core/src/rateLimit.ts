import { createHash, randomBytes } from "node:crypto";

/** Per-process salt so opaque keys can't be reversed with a table of hashed IPs. */
const SALT = randomBytes(16).toString("hex");

/** Hash identifying parts (e.g. IP + user agent) into an opaque key. Raw values are never stored. */
export function opaqueKey(parts: string[]): string {
  return createHash("sha256").update(SALT).update(parts.join("|")).digest("hex").slice(0, 32);
}

/** Opaque per-client key from request headers. Server only. */
export function clientKey(headers: Headers, scope = ""): string {
  const ip = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || headers.get("x-real-ip") || "?";
  return opaqueKey([scope, ip, headers.get("user-agent") ?? ""]);
}

export type RateLimiter = {
  take(key: string, now?: number): { ok: boolean; retryAfterMs: number };
  size(): number;
};

/** In-memory token bucket. Good enough for one instance; resets on deploy. */
export function createRateLimiter(o: { capacity: number; refillPerSec: number; maxKeys?: number }): RateLimiter {
  const maxKeys = o.maxKeys ?? 10_000;
  const buckets = new Map<string, { tokens: number; ts: number }>();
  return {
    take(key, now = Date.now()) {
      let b = buckets.get(key);
      if (!b) {
        if (buckets.size >= maxKeys) {
          const oldest = buckets.keys().next().value; // Map keeps insertion order
          if (oldest !== undefined) buckets.delete(oldest);
        }
        b = { tokens: o.capacity, ts: now };
      } else {
        const elapsed = Math.max(0, now - b.ts) / 1000;
        b.tokens = Math.min(o.capacity, b.tokens + elapsed * o.refillPerSec);
        b.ts = now;
        buckets.delete(key); // refresh insertion order
      }
      buckets.set(key, b);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { ok: true, retryAfterMs: 0 };
      }
      return { ok: false, retryAfterMs: Math.ceil(((1 - b.tokens) / o.refillPerSec) * 1000) };
    },
    size: () => buckets.size,
  };
}
