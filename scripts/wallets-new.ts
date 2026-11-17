/**
 * pnpm wallets:new <label> [balance]
 * Creates a test wallet on the NWC faucet and appends NWC_<LABEL>=... to .env.local.
 * Faucet wallets hold test sats: they can pay each other, not the real Lightning network.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { ENV_LOCAL, mask, nwcWallets } from "./_env";

const FAUCET = "https://faucet.nwc.dev";

async function main() {
  const [labelArg, balanceArg] = process.argv.slice(2);
  if (!labelArg || !/^[a-z][a-z0-9_-]{0,30}$/i.test(labelArg)) {
    console.error("usage: pnpm wallets:new <label> [balance]   (label: letters, digits, - or _)");
    process.exit(1);
  }
  const label = labelArg.toUpperCase().replace(/-/g, "_");
  const balance = Number(balanceArg ?? 10_000);
  if (!Number.isInteger(balance) || balance < 0 || balance > 1_000_000) {
    console.error("balance must be an integer between 0 and 1,000,000 sats");
    process.exit(1);
  }
  if (nwcWallets().some((w) => w.label.toUpperCase() === label)) {
    console.log(`NWC_${label} already exists in .env.local; not creating another.`);
    return;
  }

  const res = await fetch(`${FAUCET}?balance=${balance}`, { method: "POST", signal: AbortSignal.timeout(20_000) });
  const body = (await res.text()).trim();
  if (!res.ok || !body.startsWith("nostr+walletconnect://")) {
    console.error(`Faucet error (HTTP ${res.status}). The faucet may be rate-limiting; wait a minute and retry.`);
    process.exit(1);
  }

  const needsNewline = existsSync(ENV_LOCAL) && !readFileSync(ENV_LOCAL, "utf8").endsWith("\n");
  appendFileSync(ENV_LOCAL, `${needsNewline ? "\n" : ""}NWC_${label}=${body}\n`, { mode: 0o600 });
  console.log(`Created NWC_${label} (${balance} test sats): ${mask(body)}`);
  console.log("Saved to .env.local (git-ignored). Never paste the full string anywhere public.");
}

main().catch((e) => {
  console.error("wallets:new failed:", e instanceof Error ? e.message : "unknown error");
  process.exit(1);
});
