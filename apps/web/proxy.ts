import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, type CspExtra } from "@sats/core/csp";

/**
 * Per-route CSP additions. Apps add origins here, e.g. NdoxWatch:
 *   { prefix: "/map", extra: { connect: ["https://tiles.openfreemap.org"], worker: ["blob:"] } }
 * Routes not listed get the strict starter CSP.
 */
const ROUTE_EXTRAS: Array<{ prefix: string; extra: CspExtra }> = [];

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const path = request.nextUrl.pathname;
  const extra = ROUTE_EXTRAS.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`))?.extra;
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    // Browser-side NWC wallets + Nostr publishing need these exact relays (no bare wss:).
    relays: [process.env.NWC_RELAY_ORIGINS ?? "", process.env.NOSTR_RELAYS ?? ""],
    extra,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|sw.js|voice/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
