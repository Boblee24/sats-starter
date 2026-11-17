import { createHash, randomBytes } from "node:crypto";
import { LightningError } from "./errors";
import type { Tx, Wallet } from "./types";

/**
 * In-memory Wallet for tests (server-side only: uses node:crypto).
 * `payBehavior` lets tests simulate success, definitive failures and ambiguous timeouts.
 */
export type FakeWallet = Wallet & {
  txs: Tx[];
  notify(tx: Tx): void;
  settle(paymentHash: string, at?: number): Tx;
  payBehavior: "ok" | "timeout" | "quota" | "payment_failed" | "hang";
  paid: string[];
  subscribeFails: boolean;
};

export function createFakeWallet(o: { balance?: number; methods?: string[] } = {}): FakeWallet {
  let balance = o.balance ?? 10_000;
  const listeners = new Set<(tx: Tx) => void>();
  const now = () => Math.floor(Date.now() / 1000);

  const w: FakeWallet = {
    txs: [],
    paid: [],
    payBehavior: "ok",
    subscribeFails: false,
    notify(tx) {
      for (const l of listeners) l(tx);
    },
    settle(paymentHash, at = now()) {
      const tx = w.txs.find((t) => t.paymentHash === paymentHash);
      if (!tx) throw new Error("no such invoice");
      tx.state = "settled";
      tx.settledAt = at;
      tx.preimage = randomBytes(32).toString("hex");
      balance += tx.sats;
      return tx;
    },
    async info() {
      return {
        methods: o.methods ?? ["get_info", "get_balance", "make_invoice", "pay_invoice", "lookup_invoice", "list_transactions"],
        notifications: ["payment_received"],
        alias: "fake",
      };
    },
    async balanceSats() {
      return balance;
    },
    async makeInvoice({ sats, memo, expirySec = 600 }) {
      const preimage = randomBytes(32);
      const paymentHash = createHash("sha256").update(preimage).digest("hex");
      const t = now();
      w.txs.push({
        type: "incoming",
        state: "pending",
        paymentHash,
        sats,
        feesSats: 0,
        bolt11: `lnfake${sats}_${paymentHash}`,
        description: memo,
        createdAt: t,
        expiresAt: t + expirySec,
      });
      return { bolt11: `lnfake${sats}_${paymentHash}`, paymentHash, expiresAt: t + expirySec };
    },
    async payInvoice(bolt11) {
      switch (w.payBehavior) {
        case "timeout":
          throw new LightningError("TIMEOUT", false);
        case "quota":
          throw new LightningError("QUOTA_EXCEEDED", true);
        case "payment_failed":
          throw new LightningError("PAYMENT_FAILED", true);
        case "hang":
          return new Promise(() => {});
      }
      w.paid.push(bolt11);
      return { preimage: randomBytes(32).toString("hex"), feesSats: 0 };
    },
    async lookupTx(paymentHash) {
      const tx = w.txs.find((t) => t.paymentHash === paymentHash);
      if (!tx) throw new LightningError("NOT_FOUND", true);
      return { ...tx };
    },
    async lookupInvoice(paymentHash) {
      const t = await w.lookupTx(paymentHash);
      return { settled: t.state === "settled", preimage: t.preimage, sats: t.sats, settledAt: t.settledAt };
    },
    async listTransactions({ fromUnix = 0, limit = 20, type }) {
      return w.txs
        .filter((t) => (!type || t.type === type) && t.createdAt >= fromUnix)
        .slice(-limit)
        .map((t) => ({ ...t }));
    },
    async budget() {
      return null;
    },
    async onPaymentReceived(cb) {
      if (w.subscribeFails) throw new LightningError("NOT_IMPLEMENTED", true);
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    close() {
      listeners.clear();
    },
  };
  return w;
}
