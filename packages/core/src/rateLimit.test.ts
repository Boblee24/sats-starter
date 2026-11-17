import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter, opaqueKey } from "./rateLimit";

describe("rateLimit", () => {
  it("allows capacity then blocks, then refills", () => {
    const rl = createRateLimiter({ capacity: 2, refillPerSec: 1 });
    expect(rl.take("k", 0).ok).toBe(true);
    expect(rl.take("k", 0).ok).toBe(true);
    const blocked = rl.take("k", 0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    expect(rl.take("k", 1000).ok).toBe(true);
  });

  it("evicts old keys beyond maxKeys", () => {
    const rl = createRateLimiter({ capacity: 1, refillPerSec: 1, maxKeys: 3 });
    for (const k of ["a", "b", "c", "d"]) rl.take(k, 0);
    expect(rl.size()).toBe(3);
  });

  it("opaque keys never contain the raw IP", () => {
    const k = clientKey(new Headers({ "x-forwarded-for": "41.58.1.2, 10.0.0.1", "user-agent": "UA" }));
    expect(k).not.toContain("41.58");
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(opaqueKey(["a"])).toBe(opaqueKey(["a"]));
  });
});
