import { NextResponse } from "next/server";
import { serverEnv } from "@sats/core/env";

export const dynamic = "force-dynamic";

/** Liveness + config sanity. Reports only booleans, never values. */
export async function GET() {
  try {
    const env = serverEnv();
    return NextResponse.json({
      ok: true,
      demo: env.DEMO_MODE,
      aiMock: env.AI_MOCK,
      ai: Boolean(env.GEMINI_API_KEY) || env.AI_MOCK,
      sponsorWallet: Boolean(env.SPONSOR_NWC_URL),
      db: Boolean(env.DATABASE_URL),
      relays: env.NOSTR_RELAYS.length,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_ENV" }, { status: 500 });
  }
}
