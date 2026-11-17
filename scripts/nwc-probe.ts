/**
 * pnpm nwc:probe
 * Calls get_info on every NWC_* wallet in .env.local and prints methods, notifications,
 * relay origins (for NWC_RELAY_ORIGINS / the CSP) and balance.
 * The key question: do faucet wallets send payment_received notifications?
 */
import { canSpend, createWallet, relayOrigins } from "@sats/lightning";
import { nwcWallets, withTimeout } from "./_env";

async function main() {
  const wallets = nwcWallets();
  if (wallets.length === 0) {
    console.log("No NWC_* entries in .env.local. Create some with: pnpm wallets:new merchant");
    return;
  }
  const allOrigins = new Set<string>();
  for (const { label, url } of wallets) {
    console.log(`\n== ${label}`);
    try {
      const origins = relayOrigins(url);
      origins.forEach((o) => allOrigins.add(o));
      console.log(`relays:        ${origins.join(", ")}`);
      const w = createWallet(url);
      try {
        const info = await withTimeout(w.info(), 15_000, "get_info");
        console.log(`alias:         ${info.alias ?? "-"}  network: ${info.network ?? "-"}`);
        console.log(`methods:       ${info.methods.join(", ")}`);
        console.log(`notifications: ${info.notifications.length ? info.notifications.join(", ") : "(none advertised)"}`);
        console.log(`payment_received: ${info.notifications.includes("payment_received") ? "YES" : "NO -> rely on polling"}`);
        console.log(`can spend:     ${canSpend(info) ? "yes" : "no (receive-only)"}`);
        if (info.methods.includes("get_balance")) {
          console.log(`balance:       ${await withTimeout(w.balanceSats(), 15_000, "get_balance")} sats`);
        }
      } finally {
        w.close();
      }
    } catch (e) {
      console.log(`error:         ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  console.log(`\nNWC_RELAY_ORIGINS=${[...allOrigins].join(",")}`);
  console.log("(copy that line into .env.local so the browser CSP allows these relays)");
  process.exit(0);
}

main();
