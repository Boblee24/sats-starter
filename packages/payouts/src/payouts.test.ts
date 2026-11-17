import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { setLogSink } from "@sats/core/log";
import { createFakeWallet, type FakeWallet } from "@sats/lightning/fake";
import { makeTestInvoice } from "@sats/lightning/testInvoice";
import { accrue, claim, claimableSats, migratePayouts, reconcilePending, spendToday, type Db } from "./index";

const pg = new PGlite();
const db = drizzle(pg) as unknown as Db;
const restoreLog = setLogSink(() => {});
afterAll(async () => {
  restoreLog();
  await pg.close();
});

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const limits = { maxClaimSats: 1000, maxDailySats: 1500, network: "bitcoin" };
const hash = () => randomBytes(32).toString("hex");
const inv = (sats: number | null, o: { expirySec?: number; prefix?: "lnbc" | "lntbs"; timestamp?: number } = {}) =>
  makeTestInvoice({ sats, paymentHash: hash(), ...o });

let sponsor: FakeWallet;
beforeEach(async () => {
  await migratePayouts(db);
  await db.execute(sql`truncate rewards, claims`);
  sponsor = createFakeWallet();
});

describe("accrue / claimable", () => {
  it("is idempotent on sourceId", async () => {
    await accrue(db, { pubkey: ALICE, sats: 30, sourceId: "c1", reason: "correction" });
    await accrue(db, { pubkey: ALICE, sats: 30, sourceId: "c1", reason: "correction" });
    await accrue(db, { pubkey: ALICE, sats: 20, sourceId: "c2", reason: "correction" });
    expect(await claimableSats(db, ALICE)).toBe(50);
    expect(await claimableSats(db, BOB)).toBe(0);
  });

  it("rejects bad input", async () => {
    await expect(accrue(db, { pubkey: "x", sats: 1, sourceId: "s", reason: "r" })).rejects.toThrow();
    await expect(accrue(db, { pubkey: ALICE, sats: 1.5, sourceId: "s", reason: "r" })).rejects.toThrow();
  });
});

describe("claim", () => {
  beforeEach(async () => {
    await accrue(db, { pubkey: ALICE, sats: 800, sourceId: "a1", reason: "r" });
  });

  it("pays and marks paid", async () => {
    const r = await claim(db, sponsor, { pubkey: ALICE, bolt11: inv(300), limits });
    expect(r).toMatchObject({ status: "paid", sats: 300 });
    expect(sponsor.paid).toHaveLength(1);
    expect(await claimableSats(db, ALICE)).toBe(500);
    expect(await spendToday(db)).toBe(300);
  });

  it("rejects the same invoice twice", async () => {
    const bolt11 = inv(100);
    expect((await claim(db, sponsor, { pubkey: ALICE, bolt11, limits })).status).toBe("paid");
    expect(await claim(db, sponsor, { pubkey: ALICE, bolt11, limits })).toEqual({ status: "rejected", code: "DUPLICATE_INVOICE" });
    expect(sponsor.paid).toHaveLength(1);
  });

  it("rejects over-claim, over max, amountless, expired, wrong network, bad pubkey, garbage", async () => {
    const cases: Array<[string, Parameters<typeof claim>[2], string]> = [
      ["over claimable", { pubkey: ALICE, bolt11: inv(801), limits }, "OVER_CLAIM"],
      ["over max", { pubkey: ALICE, bolt11: inv(1001), limits }, "OVER_MAX_CLAIM"],
      ["amountless", { pubkey: ALICE, bolt11: inv(null), limits }, "AMOUNTLESS"],
      ["expired", { pubkey: ALICE, bolt11: inv(10, { timestamp: Math.floor(Date.now() / 1000) - 7200, expirySec: 600 }), limits }, "EXPIRED"],
      ["network", { pubkey: ALICE, bolt11: inv(10, { prefix: "lntbs" }), limits }, "WRONG_NETWORK"],
      ["pubkey", { pubkey: "nope", bolt11: inv(10), limits }, "INVALID_PUBKEY"],
      ["garbage", { pubkey: ALICE, bolt11: "lnbc1garbage", limits }, "INVALID_INVOICE"],
    ];
    for (const [, args, code] of cases) expect(await claim(db, sponsor, args)).toEqual({ status: "rejected", code });
    expect(sponsor.paid).toHaveLength(0);
    expect(await claimableSats(db, ALICE)).toBe(800);
  });

  it("enforces the app-level daily cap across pubkeys", async () => {
    await accrue(db, { pubkey: BOB, sats: 900, sourceId: "b1", reason: "r" });
    expect((await claim(db, sponsor, { pubkey: ALICE, bolt11: inv(800), limits })).status).toBe("paid");
    expect(await claim(db, sponsor, { pubkey: BOB, bolt11: inv(800), limits })).toEqual({ status: "rejected", code: "DAILY_CAP" });
    expect((await claim(db, sponsor, { pubkey: BOB, bolt11: inv(700), limits })).status).toBe("paid");
  });

  it("quota exceeded -> BUDGET_REACHED and the sats become claimable again", async () => {
    sponsor.payBehavior = "quota";
    expect(await claim(db, sponsor, { pubkey: ALICE, bolt11: inv(300), limits })).toEqual({ status: "rejected", code: "BUDGET_REACHED" });
    expect(await claimableSats(db, ALICE)).toBe(800);
    expect(await spendToday(db)).toBe(0);
  });

  it("definitive payment failure -> PAY_FAILED, sats released", async () => {
    sponsor.payBehavior = "payment_failed";
    expect(await claim(db, sponsor, { pubkey: ALICE, bolt11: inv(300), limits })).toEqual({ status: "rejected", code: "PAY_FAILED" });
    expect(await claimableSats(db, ALICE)).toBe(800);
  });

  it("pay timeout -> stays pending and the sats are NOT claimable again", async () => {
    sponsor.payBehavior = "timeout";
    expect(await claim(db, sponsor, { pubkey: ALICE, bolt11: inv(800), limits })).toMatchObject({ status: "pending", sats: 800 });
    expect(await claimableSats(db, ALICE)).toBe(0);
    sponsor.payBehavior = "ok";
    expect(await claim(db, sponsor, { pubkey: ALICE, bolt11: inv(800), limits })).toEqual({ status: "rejected", code: "OVER_CLAIM" });
  });

  it("a hung wallet is treated as ambiguous after payTimeoutMs", async () => {
    sponsor.payBehavior = "hang";
    const r = await claim(db, sponsor, { pubkey: ALICE, bolt11: inv(100), limits: { ...limits, payTimeoutMs: 50 } });
    expect(r.status).toBe("pending");
    expect(await claimableSats(db, ALICE)).toBe(700);
  });

  it("two concurrent claims for the full amount: only one passes reserve", async () => {
    const results = await Promise.all([
      claim(db, sponsor, { pubkey: ALICE, bolt11: inv(800), limits }),
      claim(db, sponsor, { pubkey: ALICE, bolt11: inv(800), limits }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["paid", "rejected"]);
    expect(sponsor.paid).toHaveLength(1);
  });

  it("reconcile marks a settled pending claim paid", async () => {
    sponsor.payBehavior = "timeout";
    const r = await claim(db, sponsor, { pubkey: ALICE, bolt11: inv(200), limits });
    expect(r.status).toBe("pending");
    const paymentHash = (r as { paymentHash: string }).paymentHash;
    sponsor.lookupTx = async (h) => ({
      type: "outgoing",
      state: h === paymentHash ? "settled" : "pending",
      paymentHash: h,
      sats: 200,
      feesSats: 0,
      bolt11: "",
      description: "",
      createdAt: 0,
    });
    expect(await reconcilePending(db, sponsor, { olderThanSec: -60 })).toEqual({ paid: 1, failed: 0, stillPending: 0 });
    expect(await claimableSats(db, ALICE)).toBe(600);
    expect(await spendToday(db)).toBe(200);
  });
});
