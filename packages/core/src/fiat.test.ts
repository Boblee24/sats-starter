import { describe, expect, it } from "vitest";
import { fiatToSats, formatFiat, formatSats, satsToFiat } from "./fiat";

describe("fiat", () => {
  const NGN = 150_000_000; // naira per BTC

  it("converts sats to rounded fiat", () => {
    expect(satsToFiat(1000, NGN)).toBe(1500);
    expect(satsToFiat(1, NGN)).toBe(2); // 1.5 -> 2
    expect(satsToFiat(0, NGN)).toBe(0);
  });

  it("rounds fiat -> sats up so the merchant is never short", () => {
    expect(fiatToSats(2000, NGN)).toBe(1334); // 1333.33 -> 1334
    expect(fiatToSats(1500, NGN)).toBe(1000); // exact stays exact
    expect(fiatToSats(0.01, NGN)).toBe(1);
    expect(fiatToSats(0, NGN)).toBe(0);
    expect(satsToFiat(fiatToSats(2000, NGN), NGN)).toBeGreaterThanOrEqual(2000);
  });

  it("rejects bad input", () => {
    expect(() => satsToFiat(1.5, NGN)).toThrow();
    expect(() => satsToFiat(-1, NGN)).toThrow();
    expect(() => fiatToSats(10, 0)).toThrow();
    expect(() => fiatToSats(Number.NaN, NGN)).toThrow();
  });

  it("formats", () => {
    expect(formatFiat(2000, "NGN")).toBe("₦2,000");
    expect(formatFiat(1000, "XOF")).toBe("1,000 FCFA");
    expect(formatSats(2500)).toBe("2,500 sats");
    expect(formatSats(1)).toBe("1 sat");
  });
});
