import { describe, expect, it } from "vitest";
import { assertPermissions, canSpend, isDefinitivePayFailure, isQuotaExceeded } from "./errors";

class Nip47WalletError extends Error {
  constructor(
    msg: string,
    public code: string,
  ) {
    super(msg);
  }
}
class Nip47ReplyTimeoutError extends Error {
  code = "INTERNAL";
}

describe("lightning errors", () => {
  it("detects quota exceeded", () => {
    expect(isQuotaExceeded(new Nip47WalletError("x", "QUOTA_EXCEEDED"))).toBe(true);
    expect(isQuotaExceeded(new Error("QUOTA_EXCEEDED"))).toBe(false);
  });

  it("treats only wallet-reported failure codes as definitive", () => {
    expect(isDefinitivePayFailure(new Nip47WalletError("x", "PAYMENT_FAILED"))).toBe(true);
    expect(isDefinitivePayFailure(new Nip47WalletError("x", "INTERNAL"))).toBe(false);
    expect(isDefinitivePayFailure(new Nip47WalletError("x", "OTHER"))).toBe(false);
    expect(isDefinitivePayFailure(new Nip47ReplyTimeoutError("timeout"))).toBe(false);
    expect(isDefinitivePayFailure(new Error("boom"))).toBe(false);
    expect(isDefinitivePayFailure(undefined)).toBe(false);
  });

  it("checks permissions", () => {
    const faucet = { methods: ["get_info", "get_balance", "make_invoice", "pay_invoice", "lookup_invoice", "list_transactions"] };
    const r = assertPermissions(faucet, {
      allow: ["make_invoice", "lookup_invoice", "list_transactions", "get_balance", "get_info"],
      forbid: ["pay_invoice", "pay_keysend"],
    });
    expect(r.ok).toBe(false);
    expect(r.forbidden).toEqual(["pay_invoice"]);
    expect(r.extra).toEqual(["pay_invoice"]);
    expect(r.missing).toEqual([]);
    expect(canSpend(faucet)).toBe(true);
    expect(canSpend({ methods: ["make_invoice"] })).toBe(false);

    const receiveOnly = assertPermissions({ methods: ["make_invoice"] }, { allow: ["make_invoice", "get_info"], forbid: ["pay_invoice"] });
    expect(receiveOnly).toMatchObject({ ok: false, missing: ["get_info"] });
  });
});
