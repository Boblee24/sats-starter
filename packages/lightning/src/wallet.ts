import { NWCClient, Nip47TimeoutError, Nip47WalletError } from "@getalby/sdk/nwc";
import type { Nip47Notification, Nip47Transaction } from "@getalby/sdk/nwc";
import { AppError } from "@sats/core/errors";
import { LightningError } from "./errors";
import type { Budget, Tx, Wallet, WalletInfo } from "./types";

/** The subset of NWCClient we use. Lets tests inject a fake. */
export type NwcLike = Pick<
  NWCClient,
  | "getInfo"
  | "getBalance"
  | "getBudget"
  | "makeInvoice"
  | "payInvoice"
  | "lookupInvoice"
  | "listTransactions"
  | "subscribeNotifications"
  | "close"
>;

const msatsToSats = (msats: number) => Math.floor(msats / 1000);

function assertSats(sats: number): void {
  if (!Number.isSafeInteger(sats) || sats <= 0) throw new AppError("INVALID_AMOUNT");
}

export function toTx(t: Nip47Transaction): Tx {
  return {
    type: t.type,
    state: t.state ?? (t.settled_at ? "settled" : "pending"),
    paymentHash: t.payment_hash,
    sats: msatsToSats(t.amount ?? 0),
    feesSats: Math.ceil((t.fees_paid ?? 0) / 1000),
    bolt11: t.invoice ?? "",
    description: t.description ?? "",
    preimage: t.preimage || undefined,
    createdAt: t.created_at,
    settledAt: t.settled_at || undefined,
    expiresAt: t.expires_at || undefined,
  };
}

function normalizeError(err: unknown): LightningError {
  if (err instanceof LightningError) return err;
  if (err instanceof Nip47WalletError) return new LightningError(err.code || "INTERNAL", true);
  if (err instanceof Nip47TimeoutError) return new LightningError("TIMEOUT", false);
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  return new LightningError(typeof code === "string" && /^[A-Z_]{2,40}$/.test(code) ? code : "UNKNOWN", false);
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw normalizeError(err);
  }
}

/** Validate an NWC URL without echoing it in errors. */
export function parseNwcUrl(nwcUrl: string): { relayUrls: string[]; walletPubkey: string } {
  if (typeof nwcUrl !== "string" || !/^nostr\+walletconnect:\/\//.test(nwcUrl.trim())) {
    throw new AppError("INVALID_NWC_URL");
  }
  try {
    const o = NWCClient.parseWalletConnectUrl(nwcUrl.trim());
    return { relayUrls: o.relayUrls, walletPubkey: o.walletPubkey };
  } catch {
    throw new AppError("INVALID_NWC_URL");
  }
}

/** Origins (scheme://host[:port]) of the relays an NWC URL uses. Safe to log/print: no secret. */
export function relayOrigins(nwcUrl: string): string[] {
  return parseNwcUrl(nwcUrl).relayUrls.map((u) => {
    try {
      const url = new URL(u);
      return `${url.protocol}//${url.host}`;
    } catch {
      return "invalid";
    }
  });
}

/** Wrap an NWC connection. All amounts in and out are integer sats. */
export function createWallet(nwcUrl: string, o: { client?: NwcLike } = {}): Wallet {
  let client: NwcLike;
  if (o.client) client = o.client;
  else {
    parseNwcUrl(nwcUrl);
    client = new NWCClient({ nostrWalletConnectUrl: nwcUrl.trim() });
  }

  return {
    async info(): Promise<WalletInfo> {
      const i = await call(() => client.getInfo());
      return { methods: i.methods ?? [], notifications: i.notifications ?? [], alias: i.alias || undefined, network: i.network };
    },

    async balanceSats() {
      const b = await call(() => client.getBalance());
      return msatsToSats(b.balance);
    },

    async makeInvoice({ sats, memo, expirySec }) {
      assertSats(sats);
      const t = await call(() =>
        client.makeInvoice({ amount: sats * 1000, description: memo.slice(0, 120), expiry: expirySec }),
      );
      return { bolt11: t.invoice, paymentHash: t.payment_hash, expiresAt: t.expires_at };
    },

    async payInvoice(bolt11) {
      const r = await call(() => client.payInvoice({ invoice: bolt11.trim() }));
      return { preimage: r.preimage, feesSats: Math.ceil((r.fees_paid ?? 0) / 1000) };
    },

    async lookupTx(paymentHash) {
      return toTx(await call(() => client.lookupInvoice({ payment_hash: paymentHash })));
    },

    async lookupInvoice(paymentHash) {
      const t = await this.lookupTx(paymentHash);
      return { settled: t.state === "settled", preimage: t.preimage, sats: t.sats, settledAt: t.settledAt };
    },

    async listTransactions({ fromUnix, limit = 20, type }) {
      const r = await call(() => client.listTransactions({ from: fromUnix, limit, type }));
      return (r.transactions ?? []).map(toTx);
    },

    async budget(): Promise<Budget | null> {
      try {
        const b = await call(() => client.getBudget());
        if (!("total_budget" in b)) return null;
        return { usedSats: msatsToSats(b.used_budget), totalSats: msatsToSats(b.total_budget), renewsAt: b.renews_at };
      } catch (err) {
        if (err instanceof LightningError && (err.code === "NOT_IMPLEMENTED" || err.code === "RESTRICTED")) return null;
        throw err;
      }
    },

    async onPaymentReceived(cb) {
      return call(() =>
        client.subscribeNotifications(
          (n: Nip47Notification) => {
            if (n.notification_type === "payment_received") cb(toTx(n.notification));
          },
          ["payment_received"],
        ),
      );
    },

    close() {
      client.close();
    },
  };
}
