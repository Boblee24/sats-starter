import { describe, expect, it } from "vitest";
import { decodeBolt11, hashPreimage, normalizeBolt11, verifyPreimage } from "./bolt11";

// From the light-bolt11-decoder test suite (mainnet, 20u = 2,000 sats).
const INVOICE =
  "lnbc20u1p3y0x3hpp5743k2g0fsqqxj7n8qzuhns5gmkk4djeejk3wkp64ppevgekvc0jsdqcve5kzar2v9nr5gpqd4hkuetesp5ez2g297jduwc20t6lmqlsg3man0vf2jfd8ar9fh8fhn2g8yttfkqxqy9gcqcqzys9qrsgqrzjqtx3k77yrrav9hye7zar2rtqlfkytl094dsp0ms5majzth6gt7ca6uhdkxl983uywgqqqqlgqqqvx5qqjqrzjqd98kxkpyw0l9tyy8r8q57k7zpy9zjmh6sez752wj6gcumqnj3yxzhdsmg6qq56utgqqqqqqqqqqqeqqjq7jd56882gtxhrjm03c93aacyfy306m4fq0tskf83c0nmet8zc2lxyyg3saz8x6vwcp26xnrlagf9semau3qm2glysp7sv95693fphvsp54l567";

describe("decodeBolt11", () => {
  it("decodes amount, hash, network and expiry", () => {
    const d = decodeBolt11(INVOICE);
    expect(d.sats).toBe(2000);
    expect(d.msats).toBe(2_000_000);
    expect(d.network).toBe("bitcoin");
    expect(d.paymentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.expiresAt).toBeGreaterThan(d.createdAt);
  });

  it("accepts lightning: URIs and uppercase (QR codes)", () => {
    expect(decodeBolt11("lightning:" + INVOICE.toUpperCase()).paymentHash).toBe(decodeBolt11(INVOICE).paymentHash);
    expect(normalizeBolt11("  LIGHTNING:LNBC1  ")).toBe("lnbc1");
  });

  it("rejects garbage with a stable code", () => {
    for (const bad of ["", "hello", "lnbc1" + "x".repeat(50), INVOICE.slice(0, -3) + "aaa"]) {
      expect(() => decodeBolt11(bad)).toThrowError(expect.objectContaining({ code: "INVALID_INVOICE" }));
    }
  });
});

describe("verifyPreimage", () => {
  const preimage = "00".repeat(31) + "01";
  const hash = hashPreimage(preimage);

  it("accepts the matching preimage", () => {
    expect(verifyPreimage(preimage, hash)).toBe(true);
    expect(verifyPreimage(preimage.toUpperCase(), hash)).toBe(true);
  });

  it("rejects a tampered preimage or hash", () => {
    expect(verifyPreimage("00".repeat(31) + "02", hash)).toBe(false);
    expect(verifyPreimage(preimage, hash.slice(0, -1) + (hash.endsWith("0") ? "1" : "0"))).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(verifyPreimage("zz", hash)).toBe(false);
    expect(verifyPreimage(preimage, "abc")).toBe(false);
  });

  it("matches a known sha256 vector", () => {
    // sha256 of 32 zero bytes
    expect(hashPreimage("00".repeat(32))).toBe("66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925");
  });
});
