import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@sats/core/env";
import { errorCode } from "@sats/core/errors";
import { log } from "@sats/core/log";
import type { Rates } from "@sats/core";

// CoinGecko simple price. XOF is pegged to EUR (1 EUR = 655.957 XOF), used if XOF is missing.
const URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=ngn,xof,eur";
const XOF_PER_EUR = 655.957;
const TTL_MS = 10 * 60 * 1000;

const schema = z.object({
  bitcoin: z.object({ ngn: z.number().positive(), xof: z.number().positive().optional(), eur: z.number().positive().optional() }),
});

let cache: Rates | null = null;

export async function GET() {
  const env = serverEnv();
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return respond(cache);
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
    if (!res.ok) throw Object.assign(new Error("http"), { code: `HTTP_${res.status}` });
    const { bitcoin } = schema.parse(await res.json());
    const xof = bitcoin.xof ?? (bitcoin.eur ? Math.round(bitcoin.eur * XOF_PER_EUR) : undefined);
    if (!xof) throw Object.assign(new Error("no xof"), { code: "NO_XOF" });
    cache = { NGN: bitcoin.ngn, XOF: xof, source: "live", fetchedAt: Date.now() };
    return respond(cache);
  } catch (err) {
    log.warn("rates.fallback", { code: errorCode(err) });
    // Serve a stale live price if we have one, otherwise the env fallback.
    if (cache) return respond(cache);
    return respond({ NGN: env.FALLBACK_BTC_NGN, XOF: env.FALLBACK_BTC_XOF, source: "fallback", fetchedAt: Date.now() });
  }
}

function respond(r: Rates) {
  return NextResponse.json(r, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } });
}
