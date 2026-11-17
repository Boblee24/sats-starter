import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import * as nip19 from "nostr-tools/nip19";
import { bytesToHex } from "@noble/hashes/utils.js";
import { npubDecode, npubEncode, pubkeyOf, serverSign, signWithKey, tagValue, verifyEvent } from "./index";
import { createKeyManager, type KeyStore } from "./browser";

const memStore = (): KeyStore => {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v), del: async (k) => void m.delete(k) };
};

describe("nostr sign/verify", () => {
  const sk = generateSecretKey();
  const e = signWithKey({ kind: 30078, content: '{"v":1,"sats":100}', tags: [["d", "x1"], ["t", "test"]] }, sk);

  it("roundtrips", () => {
    expect(verifyEvent(e)).toBe(true);
    expect(verifyEvent(JSON.parse(JSON.stringify(e)))).toBe(true);
    expect(e.pubkey).toBe(getPublicKey(sk));
    expect(tagValue(e, "d")).toBe("x1");
  });

  it("rejects tampered content even on a spread copy (nostr-tools caches verification)", () => {
    expect(verifyEvent({ ...e, content: '{"v":1,"sats":999}' })).toBe(false);
    expect(verifyEvent({ ...e, tags: [["d", "x2"]] })).toBe(false);
    expect(verifyEvent({ ...e, created_at: e.created_at + 1 })).toBe(false);
  });

  it("rejects a bad signature or malformed event", () => {
    const flipped = e.sig.slice(0, -1) + (e.sig.endsWith("0") ? "1" : "0");
    expect(verifyEvent({ ...e, sig: flipped })).toBe(false);
    const other = signWithKey({ kind: 1, content: "x", tags: [] }, generateSecretKey());
    expect(verifyEvent({ ...e, pubkey: other.pubkey })).toBe(false);
    expect(verifyEvent(null)).toBe(false);
    expect(verifyEvent({ ...e, tags: [[1]] })).toBe(false);
  });

  it("server signs with nsec or hex", () => {
    const nsec = nip19.nsecEncode(sk);
    const a = serverSign({ kind: 1, content: "a", tags: [] }, nsec);
    const b = serverSign({ kind: 1, content: "a", tags: [] }, bytesToHex(sk));
    expect(verifyEvent(a) && verifyEvent(b)).toBe(true);
    expect(pubkeyOf(nsec)).toBe(getPublicKey(sk));
    expect(() => serverSign({ kind: 1, content: "", tags: [] }, "nsec1bogus")).toThrow(/invalid nostr secret key/);
  });

  it("npub encode/decode", () => {
    const pk = getPublicKey(sk);
    expect(npubDecode(npubEncode(pk))).toBe(pk);
    expect(npubDecode("npub1nope")).toBeNull();
  });
});

describe("browser key manager", () => {
  it("creates once, persists, backs up and restores", async () => {
    const store = memStore();
    const km = createKeyManager(store);
    const a = await km.getOrCreateKey();
    expect((await km.getOrCreateKey()).pubkey).toBe(a.pubkey);
    expect(a.npub.startsWith("npub1")).toBe(true);
    expect(await km.isBackedUp()).toBe(false);
    const nsec = await km.exportBackup();
    expect(await km.isBackedUp()).toBe(true);

    const km2 = createKeyManager(memStore());
    expect((await km2.importBackup(nsec)).pubkey).toBe(a.pubkey);
    const signed = await km2.signEvent({ kind: 1, content: "hi", tags: [] });
    expect(signed.pubkey).toBe(a.pubkey);
    expect(verifyEvent(signed)).toBe(true);
  });
});
