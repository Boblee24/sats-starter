import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLogSink } from "@sats/core/log";
import { createFakeWallet } from "./fakeWallet";
import type { Tx } from "./types";
import { createPaymentFilter, watchPayments } from "./watchPayments";

const tx = (over: Partial<Tx>): Tx => ({
  type: "incoming",
  state: "settled",
  paymentHash: "a".repeat(64),
  sats: 100,
  feesSats: 0,
  bolt11: "",
  description: "",
  createdAt: 1000,
  settledAt: 1000,
  ...over,
});

describe("createPaymentFilter", () => {
  it("dedupes by paymentHash", () => {
    const f = createPaymentFilter({ sinceUnix: 0 });
    expect(f(tx({}))).toBe(true);
    expect(f(tx({}))).toBe(false);
    expect(f(tx({ paymentHash: "b".repeat(64) }))).toBe(true);
  });

  it("ignores events settled before sinceUnix (redelivered old notifications)", () => {
    const f = createPaymentFilter({ sinceUnix: 2000 });
    expect(f(tx({ settledAt: 1999 }))).toBe(false);
    expect(f(tx({ settledAt: 2000 }))).toBe(true);
  });

  it("ignores outgoing, unsettled and other invoices", () => {
    const f = createPaymentFilter({ sinceUnix: 0, paymentHash: "a".repeat(64) });
    expect(f(tx({ type: "outgoing" }))).toBe(false);
    expect(f(tx({ state: "pending" }))).toBe(false);
    expect(f(tx({ paymentHash: "c".repeat(64) }))).toBe(false);
    expect(f(tx({}))).toBe(true);
  });
});

describe("watchPayments", () => {
  let restore: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    restore = setLogSink(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    restore();
  });

  it("fires once from a notification, even if redelivered and also seen by polling", async () => {
    const w = createFakeWallet();
    const inv = await w.makeInvoice({ sats: 50, memo: "t" });
    const onPaid = vi.fn();
    watchPayments(w, { paymentHash: inv.paymentHash, sinceUnix: 0, pollMs: 1000, onPaid });
    await vi.advanceTimersByTimeAsync(0);
    const settled = w.settle(inv.paymentHash);
    w.notify(settled);
    w.notify(settled);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid.mock.calls[0]![1]).toBe("notification");
  });

  it("falls back to polling when notifications are unsupported", async () => {
    const w = createFakeWallet();
    w.subscribeFails = true;
    const inv = await w.makeInvoice({ sats: 50, memo: "t" });
    const onPaid = vi.fn();
    watchPayments(w, { paymentHash: inv.paymentHash, sinceUnix: 0, pollMs: 1000, onPaid });
    await vi.advanceTimersByTimeAsync(1500);
    expect(onPaid).not.toHaveBeenCalled();
    w.settle(inv.paymentHash);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid.mock.calls[0]![1]).toBe("poll");
  });

  it("stop() prevents any further callbacks", async () => {
    const w = createFakeWallet();
    const inv = await w.makeInvoice({ sats: 50, memo: "t" });
    const onPaid = vi.fn();
    const stop = watchPayments(w, { paymentHash: inv.paymentHash, sinceUnix: 0, pollMs: 1000, onPaid });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    w.notify(w.settle(inv.paymentHash));
    await vi.advanceTimersByTimeAsync(5000);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("without a paymentHash, reports each new payment once, in order", async () => {
    const w = createFakeWallet();
    w.subscribeFails = true;
    const a = await w.makeInvoice({ sats: 1, memo: "a" });
    const b = await w.makeInvoice({ sats: 2, memo: "b" });
    const seen: number[] = [];
    watchPayments(w, { sinceUnix: 0, pollMs: 1000, onPaid: (t) => seen.push(t.sats) });
    w.settle(b.paymentHash, 2000);
    w.settle(a.paymentHash, 1500);
    await vi.advanceTimersByTimeAsync(3500);
    expect(seen).toEqual([1, 2]);
  });
});
