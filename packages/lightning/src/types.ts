/** A wallet transaction in integer sats (msats are converted inside @sats/lightning only). */
export type Tx = {
  type: "incoming" | "outgoing";
  state: "settled" | "pending" | "failed" | "accepted";
  paymentHash: string;
  sats: number;
  feesSats: number;
  bolt11: string;
  description: string;
  preimage?: string;
  /** Unix seconds */
  createdAt: number;
  settledAt?: number;
  expiresAt?: number;
};

export type WalletInfo = { methods: string[]; notifications: string[]; alias?: string; network?: string };
export type Budget = { usedSats: number; totalSats: number; renewsAt?: number };

export interface Wallet {
  info(): Promise<WalletInfo>;
  balanceSats(): Promise<number>;
  makeInvoice(o: { sats: number; memo: string; expirySec?: number }): Promise<{
    bolt11: string;
    paymentHash: string;
    expiresAt: number;
  }>;
  payInvoice(bolt11: string): Promise<{ preimage: string; feesSats: number }>;
  lookupInvoice(paymentHash: string): Promise<{ settled: boolean; preimage?: string; sats: number; settledAt?: number }>;
  /** Full transaction for a payment hash (used by polling). */
  lookupTx(paymentHash: string): Promise<Tx>;
  listTransactions(o: { fromUnix?: number; limit?: number; type?: "incoming" | "outgoing" }): Promise<Tx[]>;
  /** null if the wallet doesn't support get_budget or reports no budget. */
  budget(): Promise<Budget | null>;
  /** Subscribe to payment_received notifications. Resolves to an unsubscribe function. */
  onPaymentReceived(cb: (tx: Tx) => void): Promise<() => void>;
  close(): void;
}
