import { describe, expect, it } from "vitest";
import { buildCsp, cleanOrigins } from "./csp";

describe("csp", () => {
  it("allows exactly the configured relay origins", () => {
    const csp = buildCsp({ nonce: "abc", relays: ["wss://relay.example.com/v1", "wss://nos.lol"] });
    expect(csp).toContain("connect-src 'self' wss://relay.example.com wss://nos.lol");
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
  });

  it("never contains a bare wss:, wildcard or unsafe-eval in production", () => {
    const csp = buildCsp({
      nonce: "n",
      relays: ["wss:", "*", "wss://*.evil.com", "ws://insecure.example", "javascript:alert(1)", "wss://ok.example"],
    });
    for (const directive of csp.split(";")) {
      const tokens = directive.trim().split(/\s+/);
      expect(tokens).not.toContain("wss:");
      expect(tokens).not.toContain("*");
      expect(tokens.some((t) => t.includes("*"))).toBe(false);
    }
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("ws://");
    expect(csp).toContain("wss://ok.example");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("dev mode adds what Next dev needs", () => {
    const csp = buildCsp({ nonce: "n", dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("apps can add map/tile origins", () => {
    const csp = buildCsp({ nonce: "n", extra: { connect: ["https://tiles.openfreemap.org/styles"], worker: ["blob:"] } });
    expect(csp).toContain("https://tiles.openfreemap.org");
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it("cleanOrigins splits comma lists", () => {
    expect(cleanOrigins(["wss://a.example, wss://b.example", undefined])).toEqual(["wss://a.example", "wss://b.example"]);
  });
});
