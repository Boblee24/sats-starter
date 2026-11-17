# sats-starter: BUILD_ORDER

Target: **Tue 08:30–12:30 WAT (about 4h).** Work top to bottom and tick each box as you finish it. If a phase runs more than 50% over its time box, cut its *stretch* items.

**Early release:** Konfam doesn't need `@sats/payouts`. As soon as Phase 5 is done, tell the human: "Phases 0–5 done, Konfam can start", so Session A can begin while you finish Phases 6–7.

## Phase 0: Workspace (15 min)
- [x] pnpm workspace, `tsconfig.base.json` (strict), root scripts: `dev`, `build`, `typecheck`, `test`, `lint`
- [x] vitest at root, prettier, minimal eslint
- [x] `LICENSE` (MIT), `.gitignore` (`.env*` except `.env.example`, `node_modules`, `.next`, `*.local`)
- [x] `.env.example` with every variable documented: `DEMO_MODE`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_MOCK`, `FALLBACK_BTC_NGN`, `FALLBACK_BTC_XOF`, `SPONSOR_NWC_URL`, `ADMIN_TOKEN`, `SERVER_NOSTR_NSEC`, `DATABASE_URL`, `MAX_DAILY_PAYOUT_SATS`, `MAX_CLAIM_SATS`, `NOSTR_RELAYS`, `NWC_RELAY_ORIGINS` (comma-separated `wss://` origins the browser may open for NWC; used only to build the CSP)

## Phase 1: @sats/core (30 min)
- [x] `env.ts`: zod-validated server env plus a separate client-safe env. Fail fast with a clear message.
- [x] `log.ts`: allowlisted structured logger (see CLAUDE.md rule 3), plus a **test proving disallowed fields are dropped**.
- [x] `rateLimit.ts`: in-memory token bucket keyed by an opaque key (hashed). Never store raw IPs.
- [x] `fiat.ts`: `satsToFiat`, `fiatToSats`, formatting for NGN/XOF. Tests for rounding.
- [x] `i18n.ts`: tiny `t(key, lang)` with `en`, `pcm` (Pidgin), `fr` dictionaries; fall back to `en`.

## Phase 2: @sats/lightning (55 min). The most important package
- [x] `wallet.ts`: wraps `NWCClient` per the contracts in CLAUDE.md. **Check the import path in node_modules first.** msats ↔ sats only here.
- [x] `watchPayments.ts`: subscribe + dedupe by paymentHash (a Set) + ignore events older than `sinceUnix` + `lookupInvoice`/`listTransactions` polling fallback. Unit-test the dedupe/ordering logic with fake events.
- [x] `bolt11.ts`: decode (use a maintained decoder such as `light-bolt11-decoder` or `bolt11`; check the licence) + `verifyPreimage` with `@noble/hashes/sha256`. Tests with a known invoice/preimage pair, plus a tampered preimage.
- [x] `errors.ts`: `isQuotaExceeded`, `assertPermissions`.
- [x] `scripts/wallets-new.ts`: `pnpm wallets:new <label> [balance]`. POSTs `https://faucet.nwc.dev?balance=<n>` and appends `NWC_<LABEL>=...` to `.env.local`. Never prints the full secret to the terminal; mask it.
- [x] `scripts/nwc-probe.ts`: `pnpm nwc:probe` calls `get_info` on every `NWC_*` in `.env.local` and prints methods + notifications. **This tells us whether faucet wallets send `payment_received`.**
- [x] `scripts/nwc-latency.ts`: `pnpm nwc:latency`. Wallet A makes an invoice, B pays, and we measure ms until A's `watchPayments` fires, over 10 runs. Print p50/p95 and whether the hit came from a **notification** or **polling**.
- [ ] HUMAN TODO: create 2 faucet wallets and run `pnpm nwc:probe` and `pnpm nwc:latency`. Paste the results into `docs/NWC_FINDINGS.md`.

## Phase 3: @sats/nostr (20 min)
- [x] `nostr-tools` + `idb-keyval`: `getOrCreateKey`, `exportBackup`, `signEvent`, `verifyEvent`, `serverSign`, `publishBestEffort`
- [x] Tests: sign → verify roundtrip; a tampered content/sig fails

## Phase 4: @sats/ai (25 min)
- [x] `@google/genai` client; `extractJson` per the contract. Structured output with a response schema (`zod-to-json-schema` or a hand-written schema).
- [x] Prompt-injection wrapper (`<untrusted_content>`) and a system rule
- [x] `AI_MOCK=1` fixtures mode; a metrics collector (`latencyMs`, `ok`, `reason`). No inputs logged.
- [x] Test: invalid model JSON → `ok:false, reason:"schema"`

## Phase 5: @sats/ui + apps/web skeleton (45 min)
- [x] `WalletPanel` (React, client): paste or scan an NWC string (store in IndexedDB), show the permissions found, balance, **Receive** (amount → invoice QR + copy), **Send** (paste or scan bolt11 → confirm amount → pay → show preimage), history (last 20 transactions), disconnect. This is the **wallet implementation** judges look for, so make it solid and clear.
- [x] `SatsAmount` (sats + ≈ fiat), `BigButton` (48px+ tap targets, high contrast), `QR` (`qrcode.react`), `OfflineBanner`, `LanguageSwitch`
- [x] `apps/web`: landing, `/wallet`, `/api/health`, `/api/rates` (CoinGecko simple price BTC→NGN,XOF; verify the endpoint; 10-min cache; env fallback)
- [x] PWA manifest + service worker (cache the app shell; leave room for an offline queue in the apps)
- [x] `next.config`: `output: "standalone"`, security headers built by one `buildCsp(extra?)` helper so each app can add its own origins:
  - `default-src 'self'`; `connect-src 'self'` + **the exact relay origins** from `NWC_RELAY_ORIGINS` and `NOSTR_RELAYS` (e.g. `wss://relay.example.com`). **Never a bare `wss:`**: that would let injected script exfiltrate to any websocket. Browser-side NWC wallets (Konfam merchant, worker/reporter wallets) fail silently if their relay is missing, so `pnpm nwc:probe` prints each wallet's `relay=` origin and the human copies it into `.env.local`.
  - `img-src 'self' data: blob:` (QR codes, canvas previews); `media-src 'self'` (voice clips); `script-src 'self'` (+ nonce if Next needs inline scripts; check the installed Next version's CSP docs)
  - **Gemini is never in the CSP.** It's called only from server routes.
  - Apps add their own origins via `buildCsp` (NdoxWatch: map tiles/style/glyphs + `worker-src blob:` for MapLibre)
  - Plus `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`
  - Test: render the headers and assert there's no bare `wss:`, `*` or `'unsafe-eval'`

## Phase 6: @sats/payouts (45 min). Used by Kàddu & NdoxWatch
- [x] Drizzle schema:
  - `rewards(id, pubkey, sats, reason, source_id UNIQUE, created_at)`
  - `claims(id, pubkey, sats, payment_hash UNIQUE, status pending|paid|failed, code, created_at, paid_at)`
- [x] `accrue` (idempotent on `source_id`), `claimableSats` (= rewards − claims[pending|paid]), `spendToday`
- [x] `claim()` in **three steps. Never hold a DB transaction open while the Lightning payment is in flight.** If the function dies mid-payment, a rolled-back `pending` row would let the same sats be claimed twice.
  1. **Reserve** (short transaction with `pg_advisory_xact_lock(hashtext(pubkey))`, then **commit**):
     - Decode bolt11 → reject if amountless, expired, wrong network, or the payment_hash was seen before
     - Reject if `sats > claimableSats` or `sats > MAX_CLAIM_SATS`, or if `spendToday + sats > MAX_DAILY_PAYOUT_SATS` (an app-level cap on top of the NWC budget, because faucet wallets may not enforce budgets). `spendToday` counts `pending` + `paid`.
     - Insert the claim as `pending`. From here on these sats are no longer claimable (`claimableSats` subtracts `pending`), and the UNIQUE `payment_hash` blocks a replay.
  2. **Pay** (no transaction): `sponsor.payInvoice(bolt11)`.
  3. **Settle** (single `UPDATE … WHERE id = ? AND status = 'pending'`):
     - success → `paid`, `paid_at`
     - **definitive** failure (NWC error codes `QUOTA_EXCEEDED`, `INSUFFICIENT_BALANCE`, `PAYMENT_FAILED`, `RESTRICTED`, `UNAUTHORIZED`) → `failed` with code (`BUDGET_REACHED` if `isQuotaExceeded`, else `PAY_FAILED`). This releases the sats.
     - **ambiguous** failure (timeout, relay drop, `INTERNAL`, `OTHER`, anything unknown) → **leave it `pending`** with code `UNKNOWN`. The money may have left, so the sats stay locked. Return `{ status: "pending" }` to the client ("Payment is processing").
  4. `reconcilePending(db, sponsor)`: for claims `pending` > 2 min, `sponsor.lookupInvoice(payment_hash)` → `paid` if settled with a preimage; `failed` only if the wallet says the payment failed. Otherwise leave it for the admin console. Run it on the admin page load and before each `claim()` for that pubkey.
- [x] On server boot: `assertPermissions(sponsorInfo, { allow:["pay_invoice","lookup_invoice","get_info","get_budget","get_balance"], forbid:["make_invoice","list_transactions"] })`. Log a **warning** (not a crash) if extra permissions are found; faucet wallets grant everything.
- [x] Tests (with a fake wallet): double claim, over-claim, expired invoice, quota → `BUDGET_REACHED`, idempotent accrue, **pay timeout → stays `pending` and the sats are not claimable again**, **two concurrent claims for the same pubkey → only one passes reserve**, reconcile marks a settled pending claim `paid`

## Phase 7: Docker, docs, CI (20 min)
- [x] `Dockerfile` (multi-stage, standalone) + `docker-compose.yml` (`web`; `db` under profile `db` with PostGIS image + volume)
- [x] `pnpm demo` = install → create `.env.local` from `.env.example` → create faucet wallets if missing → seed → start
- [x] `docs/README_TEMPLATE.md` with these headings: Problem & primary user (with sources) · Demo (video + live link) · How it works (diagram) · Why Bitcoin/Lightning/Nostr · Where AI is used & how it's evaluated · Security by design (link THREAT_MODEL) · Low-bandwidth UX · Setup (one command) · Seed data · Metrics (table) · Constraints & what's simulated · Next steps · License
- [x] `docs/THREAT_MODEL_TEMPLATE.md`: assets · actors · trust boundaries · threats → mitigations table · residual risks · "what we log / never log"
- [x] Optional: GitHub Action running `pnpm typecheck && pnpm test`

## Done when
- [x] `pnpm typecheck && pnpm test` pass
- [ ] `/wallet` works against a faucet wallet (receive + send between two wallets)
- [ ] `docs/NWC_FINDINGS.md` says whether notifications work and gives latency numbers
- [ ] Tell the human: "Starter ready. Mark the repo as a template and create konfam / kaddu / ndoxwatch."
