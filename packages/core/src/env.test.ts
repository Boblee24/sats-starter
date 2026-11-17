import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

describe("env", () => {
  it("applies defaults and treats blanks as unset", () => {
    const e = parseServerEnv({ GEMINI_API_KEY: "", DEMO_MODE: "1", NOSTR_RELAYS: "wss://a.example, wss://b.example/v1" });
    expect(e.DEMO_MODE).toBe(true);
    expect(e.AI_MOCK).toBe(false);
    expect(e.GEMINI_API_KEY).toBeUndefined();
    expect(e.MAX_CLAIM_SATS).toBe(1000);
    expect(e.NOSTR_RELAYS).toEqual(["wss://a.example", "wss://b.example/v1"]);
  });

  it("fails fast naming the variable but not leaking the value", () => {
    const secret = "https://not-nwc.example/?secret=abcdef";
    try {
      parseServerEnv({ SPONSOR_NWC_URL: secret, NOSTR_RELAYS: "ws://insecure.example" });
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("SPONSOR_NWC_URL");
      expect(msg).toContain("NOSTR_RELAYS");
      expect(msg).not.toContain("abcdef");
    }
  });
});
