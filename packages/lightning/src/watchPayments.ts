import { errorCode } from "@sats/core/errors";
import { log } from "@sats/core/log";
import type { Tx, Wallet } from "./types";

export type PaySource = "notification" | "poll";

export type WatchOptions = {
  /** Watch one invoice. Without it, every new incoming settled payment fires. */
  paymentHash?: string;
  /** Ignore anything settled before this (unix seconds), e.g. the session start. */
  sinceUnix: number;
  /** Polling fallback interval. Default 3000 ms. 0 disables polling (tests). */
  pollMs?: number;
  onPaid: (tx: Tx, source: PaySource) => void;
};

/**
 * Pure filter used by watchPayments: dedupe by paymentHash, ignore old/outgoing/unsettled events.
 * Notifications can be redelivered after a resubscribe, and polling sees the same tx again,
 * so every path goes through this.
 */
export function createPaymentFilter(o: { paymentHash?: string; sinceUnix: number }) {
  const seen = new Set<string>();
  return (tx: Tx): boolean => {
    if (tx.type !== "incoming" || tx.state !== "settled") return false;
    if (o.paymentHash && tx.paymentHash !== o.paymentHash) return false;
    if ((tx.settledAt ?? tx.createdAt) < o.sinceUnix) return false;
    if (seen.has(tx.paymentHash)) return false;
    seen.add(tx.paymentHash);
    return true;
  };
}

/**
 * Fire onPaid once per settled incoming payment, from whichever arrives first:
 * a payment_received notification or the polling fallback (some wallets never notify).
 * With a paymentHash it stops itself after the first hit. Returns a stop function.
 */
export function watchPayments(wallet: Wallet, o: WatchOptions): () => void {
  const accept = createPaymentFilter(o);
  const pollMs = o.pollMs ?? 3000;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    try {
      unsubscribe?.();
    } catch {
      /* already closed */
    }
  };

  const handle = (tx: Tx, source: PaySource) => {
    if (stopped || !accept(tx)) return;
    if (o.paymentHash) stop();
    o.onPaid(tx, source);
  };

  wallet
    .onPaymentReceived((tx) => handle(tx, "notification"))
    .then((unsub) => {
      if (stopped) unsub();
      else unsubscribe = unsub;
    })
    .catch((err) => log.warn("lightning.subscribe_failed", { code: errorCode(err) }));

  const poll = async () => {
    if (stopped) return;
    try {
      if (o.paymentHash) {
        handle(await wallet.lookupTx(o.paymentHash), "poll");
      } else {
        const txs = await wallet.listTransactions({ fromUnix: o.sinceUnix, type: "incoming", limit: 20 });
        // Oldest first so callers see payments in order.
        for (const tx of [...txs].sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0))) handle(tx, "poll");
      }
    } catch (err) {
      log.warn("lightning.poll_failed", { code: errorCode(err) });
    }
    if (!stopped && pollMs > 0) timer = setTimeout(poll, pollMs);
  };
  if (pollMs > 0) timer = setTimeout(poll, pollMs);

  return stop;
}
