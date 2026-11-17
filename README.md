# sats-starter

Shared foundation for three Dakar Bitcoin Hack 2026 projects (Konfam, Kàddu, NdoxWatch): a Lightning wallet over
Nostr Wallet Connect, Nostr signing, a guarded Gemini extractor, a payouts ledger, and a phone-first Next.js app.
MIT licensed. Use it as a GitHub template.

## Quick start
```bash
pnpm demo
```
Creates `.env.local` (with generated secrets), two faucet test wallets (`DEMO_WALLETS=alice,bob`), fills
`NWC_RELAY_ORIGINS`, seeds, builds and starts http://localhost:3000. Paste one wallet's `NWC_*` string into `/wallet`.

Docker: `docker compose up` (web) or `docker compose --profile db up` (web + PostGIS).

## Packages
| Package | What it does |
|---|---|
| `@sats/core` | zod env, allowlisted logger, rate limit, sats↔NGN/XOF, i18n (en/pcm/fr), CSP builder |
| `@sats/lightning` | NWC wallet wrapper (integer sats), `watchPayments` (notifications + polling, deduped), bolt11 decode, `verifyPreimage`, permission checks |
| `@sats/nostr` | browser key in IndexedDB + backup, sign/verify, server attestations, best-effort publish |
| `@sats/ai` | `extractJson`: Gemini structured output, zod-validated, prompt-injection wrapper, `AI_MOCK` fixtures, metrics |
| `@sats/ui` | `WalletPanel` (connect, permissions, balance, receive, send, history), `SatsAmount`, `BigButton`, `QR`, `ScanButton`, banners |
| `@sats/payouts` | rewards ledger + claims: reserve → pay → settle, daily caps, reconcile, sponsor permission check |
| `apps/web` | landing, `/wallet`, `/api/rates`, `/api/health`, nonce CSP (`proxy.ts`), PWA |

## Scripts
| Command | |
|---|---|
| `pnpm wallets:new <label> [sats]` | faucet test wallet → `NWC_<LABEL>` in `.env.local` (secret masked) |
| `pnpm nwc:probe` | methods, notification support, relay origins, balance for each wallet |
| `pnpm nwc:latency [recv] [payer] [runs]` | pay → detected latency, notification vs polling |
| `pnpm typecheck && pnpm test` | before every commit |

## Rules (see CLAUDE.md)
Integer sats everywhere; log only through `@sats/core/log`; secrets only in server env; zod on every input;
AI never moves money; no custody.

## Known limits
- Faucet wallets hold test sats; they pay each other, not the real Lightning network.
- Browser wallets need their relay in `NWC_RELAY_ORIGINS` (CSP); `pnpm demo` fills it.
- The rate limiter is in-memory (per instance).
