# <Project name>: <one-line promise>

> Built for Dakar Bitcoin Hack 2026. MIT licensed. **Demo: test sats, sample data.**

## Problem & primary user
- Who has the problem, where, how often. **Every number needs a source link** (see the claims table in the build plan).
- Primary user: …
- Estimated reach: … (source)

## Demo
- 3-minute video: <link>
- Live MVP: <link>

## How it works
```
<diagram: phone → app → NWC (Nostr relay) → wallet; server routes; what is stored where>
```

## Why Bitcoin / Lightning / Nostr
- Bitcoin/Lightning: …
- Nostr: …

## Where AI is used and how it's evaluated
- What the model does (it only proposes; rules and the ledger decide)
- What it can never do (move money, pick amounts or recipients)
- Eval results: see [Metrics](#metrics) and `eval/RESULTS.md`

## Security by design
Summary + link to [THREAT_MODEL.md](THREAT_MODEL.md): minimal attack surface, secrets, input validation, no PII in logs.

## Low-bandwidth UX
- First-load JS: … KB (measured how)
- Slow 3G test: …
- Offline behaviour: …

## Setup (one command)
```bash
pnpm demo
```
Or with Docker: `docker compose up` (add `--profile db` for the database).

## Seed data
What's seeded, where it came from, and its licence.

## Metrics
| Metric | Value | How measured |
|---|---|---|
| | | |

## Constraints & what's simulated
Be explicit: faucet test sats, scripted personas, replayed events, mock sponsor, etc.

## Next steps
- …

## License
MIT
