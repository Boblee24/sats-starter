# Threat model: <Project>

## Assets
| Asset | Where it lives | Why it matters |
|---|---|---|
| User's NWC connection string | Browser IndexedDB only | Can receive (and maybe spend) money |
| Sponsor/funder NWC string | Server env only | Pays out rewards |
| User Nostr key | Browser IndexedDB | Signs submissions/receipts |
| Server Nostr key | Server env | Signs attestations |
| Personal data (photos, audio, location) | … | … |

## Actors
- Honest user, sponsor/funder, admin
- Attackers: fraudster/farmer (Sybil), scammer with forged proof, curious server operator, network attacker, prompt injector

## Trust boundaries
```
browser ⇄ app server ⇄ (Gemini API, Postgres)
browser ⇄ Nostr relays ⇄ user's wallet service
```

## Threats → mitigations
| Threat | Mitigation | Test / evidence |
|---|---|---|
| Stolen sponsor key drains funds | pay_invoice-only connection with budget + expiry; app-level daily cap | payouts tests |
| Double payout on timeout/crash | reserve → pay → settle; ambiguous failures stay pending; reconcile | `payouts.test.ts` |
| Replay of a signed event | unique event id; time window | … |
| Prompt injection in user content | `<untrusted_content>` wrapper; AI has no money fields; zod validation | … |
| XSS / injected scripts | per-request nonce CSP, exact relay origins only | `csp.test.ts` |
| Abuse / flooding | rate limits keyed by hashed client key | … |
| PII leakage via logs | allowlisted logger | `log.test.ts` |

## Residual risks
What we accept and why (e.g. collusion between k workers, GPS spoofing reduced not prevented).

## What we log / never log
- **Log:** event name, id, paymentHash, latencyMs, status, code, count
- **Never log:** request bodies, IPs, coordinates, images, audio, transcripts, NWC strings, invoices, keys
