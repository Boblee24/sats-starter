import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const ENV_LOCAL = resolve(process.cwd(), ".env.local");

/** Load .env.local into process.env (Node's built-in loader). */
export function loadEnvLocal(): void {
  if (existsSync(ENV_LOCAL)) process.loadEnvFile(ENV_LOCAL);
}

/** All NWC_<LABEL>=... entries from .env.local, in file order. */
export function nwcWallets(): { label: string; url: string }[] {
  if (!existsSync(ENV_LOCAL)) return [];
  const out: { label: string; url: string }[] = [];
  for (const line of readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/)) {
    const m = /^NWC_([A-Z0-9_]+)=(.+)$/.exec(line.trim());
    if (m) out.push({ label: m[1]!.toLowerCase(), url: m[2]!.trim().replace(/^"|"$/g, "") });
  }
  return out;
}

/** Show enough to recognise a connection string without exposing its secret. */
export function mask(nwcUrl: string): string {
  const pub = /^nostr\+walletconnect:\/\/([0-9a-f]{64})/.exec(nwcUrl)?.[1];
  return pub ? `nostr+walletconnect://${pub.slice(0, 8)}…?secret=••••` : "(unrecognised)";
}

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms)),
  ]);
}
