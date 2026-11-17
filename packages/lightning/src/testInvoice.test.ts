import { describe, expect, it } from "vitest";
import { decodeBolt11 } from "./bolt11";
import { makeTestInvoice } from "./testInvoice";

describe("makeTestInvoice", () => {
  it("produces invoices decodeBolt11 accepts", () => {
    const hash = "ab".repeat(32);
    const d = decodeBolt11(makeTestInvoice({ sats: 250, paymentHash: hash, timestamp: 1_800_000_000, expirySec: 600 }));
    expect(d).toMatchObject({ sats: 250, paymentHash: hash, createdAt: 1_800_000_000, expiresAt: 1_800_000_600, network: "bitcoin" });
    expect(decodeBolt11(makeTestInvoice({ sats: null, paymentHash: hash })).sats).toBeNull();
    expect(decodeBolt11(makeTestInvoice({ sats: 1, paymentHash: hash, prefix: "lntbs" })).network).toBe("signet");
  });
});
