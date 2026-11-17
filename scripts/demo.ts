/**
 * pnpm demo: one command from a fresh clone to a running app.
 *   1. .env.local from .env.example, with fresh ADMIN_TOKEN and SERVER_NOSTR_NSEC
 *   2. faucet test wallets for every label in DEMO_WALLETS (default: alice,bob), if missing
 *   3. NWC_RELAY_ORIGINS filled from those wallets (so the browser CSP allows their relays)
 *   4. seed (apps override scripts/seed.ts)
 *   5. build + start on http://localhost:3000
 * Flags: --no-start (stop after setup), --no-wallets (skip the faucet).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { relayOrigins } from "@sats/lightning";
import { ENV_LOCAL, nwcWallets } from "./_env";

const args = new Set(process.argv.slice(2));

function run(cmd: string, cmdArgs: string[]) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\n✗ ${cmd} ${cmdArgs.join(" ")} failed`);
    process.exit(r.status ?? 1);
  }
}

function setVar(text: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}

function getVar(text: string, key: string): string {
  return new RegExp(`^${key}=(.*)$`, "m").exec(text)?.[1]?.trim() ?? "";
}

// 1. env
if (!existsSync(ENV_LOCAL)) {
  copyFileSync(".env.example", ENV_LOCAL);
  console.log("✓ created .env.local from .env.example");
}
let env = readFileSync(ENV_LOCAL, "utf8");
if (!getVar(env, "ADMIN_TOKEN")) env = setVar(env, "ADMIN_TOKEN", randomBytes(24).toString("base64url"));
if (!getVar(env, "SERVER_NOSTR_NSEC")) env = setVar(env, "SERVER_NOSTR_NSEC", randomBytes(32).toString("hex"));
if (!getVar(env, "GEMINI_API_KEY") && getVar(env, "AI_MOCK") !== "1") {
  env = setVar(env, "AI_MOCK", "1");
  console.log("• no GEMINI_API_KEY: AI_MOCK=1 (fixtures)");
}
writeFileSync(ENV_LOCAL, env, { mode: 0o600 });
console.log("✓ .env.local ready (secrets generated locally, never printed)");

// 2. wallets
if (!args.has("--no-wallets")) {
  const want = (process.env.DEMO_WALLETS ?? "alice,bob").split(",").map((s) => s.trim()).filter(Boolean);
  const have = new Set(nwcWallets().map((w) => w.label));
  for (const label of want) {
    if (have.has(label.toLowerCase().replace(/-/g, "_"))) continue;
    run("pnpm", ["exec", "tsx", "scripts/wallets-new.ts", label, "10000"]);
  }
}

// 3. relay origins for the CSP
const origins = new Set<string>(getVar(readFileSync(ENV_LOCAL, "utf8"), "NWC_RELAY_ORIGINS").split(",").filter(Boolean));
for (const w of nwcWallets()) {
  try {
    relayOrigins(w.url).forEach((o) => o.startsWith("wss://") && origins.add(o));
  } catch {
    console.log(`• NWC_${w.label.toUpperCase()} is not a valid connection string; skipped`);
  }
}
writeFileSync(ENV_LOCAL, setVar(readFileSync(ENV_LOCAL, "utf8"), "NWC_RELAY_ORIGINS", [...origins].join(",")), { mode: 0o600 });
console.log(`✓ NWC_RELAY_ORIGINS=${[...origins].join(",") || "(none)"}`);

// 4. seed
run("pnpm", ["exec", "tsx", "scripts/seed.ts"]);

// 5. start
if (args.has("--no-start")) {
  console.log("\nSetup done. Start with: pnpm build && pnpm start");
} else {
  run("pnpm", ["--filter", "web", "build"]);
  console.log("\n→ http://localhost:3000  (wallets: see NWC_* in .env.local; paste one into /wallet)\n");
  run("pnpm", ["--filter", "web", "start", "--port", "3000"]);
}
