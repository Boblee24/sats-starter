/**
 * pnpm nwc:latency [receiverLabel] [payerLabel] [runs]
 * Wallet A makes an invoice, wallet B pays it; measures ms from "pay sent" until A's watchPayments
 * fires, and whether the hit came from a notification or polling. Prints a markdown block for
 * docs/NWC_FINDINGS.md. Defaults: the first two NWC_* wallets, 10 runs, 10 sats each.
 */
import { createWallet, watchPayments, type PaySource } from "@sats/lightning";
import { nwcWallets, withTimeout } from "./_env";

const SATS = 10;
const RUN_TIMEOUT_MS = 30_000;

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? NaN;
}

async function main() {
  const all = nwcWallets();
  const [recvLabel, payLabel, runsArg] = process.argv.slice(2);
  const recv = recvLabel ? all.find((w) => w.label === recvLabel) : all[0];
  const pay = payLabel ? all.find((w) => w.label === payLabel) : all.find((w) => w !== recv);
  const runs = Number(runsArg ?? 10);
  if (!recv || !pay) {
    console.error("Need two NWC_* wallets in .env.local (pnpm wallets:new a && pnpm wallets:new b)");
    process.exit(1);
  }
  console.log(`receiver=${recv.label} payer=${pay.label} runs=${runs} amount=${SATS} sats`);

  const A = createWallet(recv.url);
  const B = createWallet(pay.url);
  const results: { ms: number; source: PaySource }[] = [];
  let failures = 0;

  for (let i = 1; i <= runs; i++) {
    try {
      const inv = await withTimeout(A.makeInvoice({ sats: SATS, memo: `latency ${i}` }), 15_000, "make_invoice");
      const sinceUnix = Math.floor(Date.now() / 1000) - 5;
      let t0 = 0;
      const hit = new Promise<{ ms: number; source: PaySource }>((resolve) => {
        watchPayments(A, {
          paymentHash: inv.paymentHash,
          sinceUnix,
          pollMs: 1000,
          onPaid: (_tx, source) => resolve({ ms: Date.now() - t0, source }),
        });
      });
      // Give the subscription a moment to register before paying.
      await new Promise((r) => setTimeout(r, 1500));
      t0 = Date.now();
      await withTimeout(B.payInvoice(inv.bolt11), 20_000, "pay_invoice");
      const r = await withTimeout(hit, RUN_TIMEOUT_MS, "payment detection");
      results.push(r);
      console.log(`run ${i}: ${r.ms} ms via ${r.source}`);
    } catch (e) {
      failures++;
      console.log(`run ${i}: FAILED (${e instanceof Error ? e.message : "unknown"})`);
    }
  }
  A.close();
  B.close();

  const ms = results.map((r) => r.ms);
  const viaNotif = results.filter((r) => r.source === "notification").length;
  console.log(`
### NWC latency (${new Date().toISOString().slice(0, 10)})

| Metric | Value |
|---|---|
| Runs (ok / failed) | ${results.length} / ${failures} |
| p50 pay → detected | ${ms.length ? pct(ms, 50) : "-"} ms |
| p95 pay → detected | ${ms.length ? pct(ms, 95) : "-"} ms |
| Detected via notification | ${viaNotif} |
| Detected via polling (1 s) | ${results.length - viaNotif} |
`);
  process.exit(0);
}

main();
