/**
 * @sats/payouts: rewards ledger + claims, paid from a sponsor's capped NWC wallet. SERVER ONLY.
 *
 * Safety model (see starter BUILD_ORDER Phase 6):
 *  - claim() never holds a DB transaction open while a Lightning payment is in flight.
 *  - Reserve: short transaction under an advisory lock, commits the claim as `pending`.
 *    Pending sats are no longer claimable and the UNIQUE payment_hash blocks replays.
 *  - Pay outside any transaction.
 *  - Settle: paid, failed (only on a definitive wallet error) or left pending (ambiguous).
 *  - reconcilePending() resolves stuck pending claims via lookup_invoice.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { errorCode } from "@sats/core/errors";
import { log } from "@sats/core/log";
import { assertPermissions, decodeBolt11, isDefinitivePayFailure, isQuotaExceeded, type Wallet } from "@sats/lightning";
import { claims, rewards, PAYOUTS_SQL } from "./schema";

export { claims, rewards, PAYOUTS_SQL };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any, any>;

export type ClaimError =
  | "INVALID_PUBKEY"
  | "INVALID_INVOICE"
  | "AMOUNTLESS"
  | "EXPIRED"
  | "WRONG_NETWORK"
  | "DUPLICATE_INVOICE"
  | "OVER_CLAIM"
  | "OVER_MAX_CLAIM"
  | "DAILY_CAP"
  | "BUDGET_REACHED"
  | "PAY_FAILED";

export type ClaimResult =
  | { status: "paid"; sats: number; paymentHash: string }
  | { status: "pending"; sats: number; paymentHash: string }
  | { status: "rejected"; code: ClaimError };

export type ClaimLimits = {
  maxClaimSats: number;
  maxDailySats: number;
  /** "bitcoin" | "testnet" | "signet" | "regtest". Omit to skip the network check. */
  network?: string;
  /** How long to wait for the sponsor wallet before treating the payment as ambiguous. */
  payTimeoutMs?: number;
};

const PUBKEY_RE = /^[0-9a-f]{64}$/;
const EXPIRY_MARGIN_SEC = 30;

async function sumRewards(db: Db, pubkey: string): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${rewards.sats}), 0)::int` })
    .from(rewards)
    .where(eq(rewards.pubkey, pubkey));
  return Number(r?.total ?? 0);
}

async function sumClaimed(db: Db, pubkey: string): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${claims.sats}), 0)::int` })
    .from(claims)
    .where(and(eq(claims.pubkey, pubkey), inArray(claims.status, ["pending", "paid"])));
  return Number(r?.total ?? 0);
}

/** Record a reward. Idempotent on sourceId (e.g. the correction or report id). */
export async function accrue(db: Db, o: { pubkey: string; sats: number; sourceId: string; reason: string }): Promise<void> {
  if (!PUBKEY_RE.test(o.pubkey)) throw new Error("accrue: invalid pubkey");
  if (!Number.isSafeInteger(o.sats) || o.sats <= 0) throw new Error("accrue: sats must be a positive integer");
  if (!o.sourceId) throw new Error("accrue: sourceId required");
  await db
    .insert(rewards)
    .values({ pubkey: o.pubkey, sats: o.sats, sourceId: o.sourceId, reason: o.reason.slice(0, 64) })
    .onConflictDoNothing({ target: rewards.sourceId });
}

/** Rewards minus claims that are pending or paid. */
export async function claimableSats(db: Db, pubkey: string): Promise<number> {
  return Math.max(0, (await sumRewards(db, pubkey)) - (await sumClaimed(db, pubkey)));
}

/** Sats committed today (UTC): pending + paid. */
export async function spendToday(db: Db): Promise<number> {
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${claims.sats}), 0)::int` })
    .from(claims)
    .where(and(inArray(claims.status, ["pending", "paid"]), sql`${claims.createdAt} >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`));
  return Number(r?.total ?? 0);
}

/** NIP-47 get_info network names -> bolt11 network names. */
export function bolt11Network(nip47Network: string | undefined): string | undefined {
  if (!nip47Network) return undefined;
  const n = nip47Network.toLowerCase();
  return n === "mainnet" ? "bitcoin" : ["bitcoin", "testnet", "signet", "regtest"].includes(n) ? n : undefined;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(Object.assign(new Error("t"), { code: "TIMEOUT" })), ms))]);
}

/**
 * Pay a worker's invoice for (part of) their claimable rewards.
 * The invoice must be for an exact amount; the amount comes from the invoice, checked against the ledger.
 */
export async function claim(db: Db, sponsor: Wallet, o: { pubkey: string; bolt11: string; limits: ClaimLimits }): Promise<ClaimResult> {
  const { pubkey, limits } = o;
  if (!PUBKEY_RE.test(pubkey)) return { status: "rejected", code: "INVALID_PUBKEY" };

  let decoded;
  try {
    decoded = decodeBolt11(o.bolt11);
  } catch {
    return { status: "rejected", code: "INVALID_INVOICE" };
  }
  const { sats, paymentHash } = decoded;
  if (sats === null || sats <= 0) return { status: "rejected", code: "AMOUNTLESS" };
  if (decoded.expiresAt <= Date.now() / 1000 + EXPIRY_MARGIN_SEC) return { status: "rejected", code: "EXPIRED" };
  if (limits.network && decoded.network !== limits.network) return { status: "rejected", code: "WRONG_NETWORK" };
  if (sats > limits.maxClaimSats) return { status: "rejected", code: "OVER_MAX_CLAIM" };

  // ---- 1. Reserve (short transaction, committed before any money moves) ----
  type Reserve = { ok: true; id: string } | { ok: false; code: ClaimError };
  let reserved: Reserve;
  try {
    reserved = await db.transaction(async (tx) => {
      // Global lock: the daily cap spans all pubkeys. The section is a few fast queries, so contention is low.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sats:payouts:reserve'))`);
      const [seen] = await tx.select({ id: claims.id }).from(claims).where(eq(claims.paymentHash, paymentHash));
      if (seen) return { ok: false, code: "DUPLICATE_INVOICE" } as const;
      if (sats > (await claimableSats(tx as unknown as Db, pubkey))) return { ok: false, code: "OVER_CLAIM" } as const;
      if ((await spendToday(tx as unknown as Db)) + sats > limits.maxDailySats) return { ok: false, code: "DAILY_CAP" } as const;
      const [row] = await tx
        .insert(claims)
        .values({ pubkey, sats, paymentHash, bolt11: o.bolt11.trim(), status: "pending" })
        .returning({ id: claims.id });
      return { ok: true, id: row!.id } as const;
    });
  } catch (err) {
    // A concurrent insert of the same payment_hash loses on the UNIQUE constraint.
    // Drizzle wraps driver errors; the Postgres code may be on err.cause.
    const pgCode = (e: unknown) => (e && typeof e === "object" ? String((e as { code?: unknown }).code) : "");
    if (pgCode(err) === "23505" || pgCode((err as { cause?: unknown })?.cause) === "23505") {
      return { status: "rejected", code: "DUPLICATE_INVOICE" };
    }
    throw err;
  }
  if (!reserved.ok) {
    log.info("payouts.claim_rejected", { code: reserved.code });
    return { status: "rejected", code: reserved.code };
  }

  // ---- 2. Pay (no transaction) ----
  try {
    await withTimeout(sponsor.payInvoice(o.bolt11), limits.payTimeoutMs ?? 45_000);
  } catch (err) {
    // ---- 3a. Settle a failure ----
    if (isDefinitivePayFailure(err)) {
      const code: ClaimError = isQuotaExceeded(err) ? "BUDGET_REACHED" : "PAY_FAILED";
      await db
        .update(claims)
        .set({ status: "failed", code, updatedAt: new Date() })
        .where(and(eq(claims.id, reserved.id), eq(claims.status, "pending")));
      log.warn("payouts.pay_failed", { id: reserved.id, code });
      return { status: "rejected", code };
    }
    // Ambiguous: the money may have left. Keep the sats locked until reconciled.
    await db.update(claims).set({ code: "UNKNOWN", updatedAt: new Date() }).where(eq(claims.id, reserved.id));
    log.warn("payouts.pay_unknown", { id: reserved.id, code: errorCode(err) });
    return { status: "pending", sats, paymentHash };
  }

  // ---- 3b. Settle success ----
  await db
    .update(claims)
    .set({ status: "paid", code: null, paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(claims.id, reserved.id), eq(claims.status, "pending")));
  log.info("payouts.paid", { id: reserved.id, count: sats });
  return { status: "paid", sats, paymentHash };
}

/**
 * Resolve claims stuck in `pending` (e.g. the pay call timed out) by asking the sponsor wallet.
 * Only marks `failed` when the wallet says the payment failed; otherwise leaves it for the admin.
 */
export async function reconcilePending(
  db: Db,
  sponsor: Wallet,
  o: { olderThanSec?: number; pubkey?: string } = {},
): Promise<{ paid: number; failed: number; stillPending: number }> {
  const cutoff = new Date(Date.now() - (o.olderThanSec ?? 120) * 1000);
  const rows = await db
    .select({ id: claims.id, paymentHash: claims.paymentHash })
    .from(claims)
    .where(and(eq(claims.status, "pending"), lt(claims.createdAt, cutoff), o.pubkey ? eq(claims.pubkey, o.pubkey) : undefined));
  const out = { paid: 0, failed: 0, stillPending: 0 };
  for (const r of rows) {
    try {
      const tx = await sponsor.lookupTx(r.paymentHash);
      if (tx.state === "settled") {
        await db.update(claims).set({ status: "paid", code: null, paidAt: new Date(), updatedAt: new Date() }).where(and(eq(claims.id, r.id), eq(claims.status, "pending")));
        out.paid++;
      } else if (tx.state === "failed") {
        await db.update(claims).set({ status: "failed", code: "PAY_FAILED", updatedAt: new Date() }).where(and(eq(claims.id, r.id), eq(claims.status, "pending")));
        out.failed++;
      } else out.stillPending++;
    } catch {
      out.stillPending++;
    }
  }
  if (rows.length) log.info("payouts.reconciled", { count: rows.length, status: `${out.paid}p/${out.failed}f/${out.stillPending}u` });
  return out;
}

export const SPONSOR_ALLOW = ["pay_invoice", "lookup_invoice", "get_info", "get_budget", "get_balance"];
export const SPONSOR_FORBID = ["make_invoice", "list_transactions"];

/** Boot check: warn (don't crash) when the sponsor connection has more power than it needs. */
export async function checkSponsor(sponsor: Wallet): Promise<{ ok: boolean; network?: string; extra: string[] }> {
  const info = await sponsor.info();
  const r = assertPermissions(info, { allow: SPONSOR_ALLOW, forbid: SPONSOR_FORBID });
  if (!r.ok) log.warn("payouts.sponsor_permissions", { status: r.forbidden.length ? "too_broad" : "missing", count: r.extra.length + r.missing.length });
  return { ok: r.ok, network: bolt11Network(info.network), extra: r.extra };
}

/** Run the payouts DDL (idempotent). */
export async function migratePayouts(db: Db): Promise<void> {
  // One statement per call: drivers run execute() as a prepared statement, which allows only one.
  for (const stmt of PAYOUTS_SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(sql.raw(stmt));
  }
}
