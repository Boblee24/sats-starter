import { z } from "zod";

/** "" in a .env file means "unset". */
const blankToUndef = (v: unknown) => (v === "" ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(blankToUndef, s.optional());
const flag = z.preprocess(blankToUndef, z.enum(["0", "1"]).default("0")).transform((v) => v === "1");
const wssList = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []),
  z.array(z.string().regex(/^wss:\/\/[^\s/?#]+(\/[^\s?#]*)?$/, "must be a wss:// URL")),
);

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DEMO_MODE: flag,
  GEMINI_API_KEY: opt(z.string().min(10)),
  GEMINI_MODEL: z.preprocess(blankToUndef, z.string().min(1).default("gemini-2.5-flash-lite")),
  AI_MOCK: flag,
  FALLBACK_BTC_NGN: z.preprocess(blankToUndef, z.coerce.number().positive().default(87_000_000)),
  FALLBACK_BTC_XOF: z.preprocess(blankToUndef, z.coerce.number().positive().default(38_500_000)),
  SPONSOR_NWC_URL: opt(z.string().startsWith("nostr+walletconnect://")),
  ADMIN_TOKEN: opt(z.string().min(24, "ADMIN_TOKEN must be at least 24 chars")),
  SERVER_NOSTR_NSEC: opt(z.string().regex(/^(nsec1[02-9ac-hj-np-z]+|[0-9a-f]{64})$/, "nsec1… or 64-hex")),
  DATABASE_URL: opt(z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL")),
  MAX_DAILY_PAYOUT_SATS: z.preprocess(blankToUndef, z.coerce.number().int().nonnegative().default(5000)),
  MAX_CLAIM_SATS: z.preprocess(blankToUndef, z.coerce.number().int().positive().default(1000)),
  NOSTR_RELAYS: wssList,
  NWC_RELAY_ORIGINS: wssList,
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parse an env object. Errors name the variable and the problem, never the value. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const r = serverEnvSchema.safeParse(source);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid server environment:\n${lines.join("\n")}\nSee .env.example.`);
  }
  return r.data;
}

let cached: ServerEnv | undefined;

/** Validated server env (cached). Throws in the browser so secrets can't leak into client bundles. */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") throw new Error("serverEnv() called in the browser");
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** Fetch a required server value or fail fast with a clear message. */
export function requireEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const v = serverEnv()[key];
  if (v === undefined || v === null || v === "") throw new Error(`Missing required env var ${String(key)} (see .env.example)`);
  return v as NonNullable<ServerEnv[K]>;
}

/** Test helper. */
export function resetEnvCache(): void {
  cached = undefined;
}

/**
 * Client-safe env. Only NEXT_PUBLIC_* values are inlined by Next; never put secrets here.
 * Reads must be literal `process.env.NEXT_PUBLIC_X` for Next to inline them.
 */
export const clientEnv = {
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "1",
};
