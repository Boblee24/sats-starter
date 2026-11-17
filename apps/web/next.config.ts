import path from "node:path";
import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { SECURITY_HEADERS } from "@sats/core/csp";

// One .env.local at the monorepo root serves the app and the scripts.
const ROOT = path.resolve(process.cwd(), "../..");
loadEnvConfig(ROOT, process.env.NODE_ENV !== "production");

const nextConfig: NextConfig = {
  output: "standalone",
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@sats/core", "@sats/lightning", "@sats/nostr", "@sats/ai", "@sats/ui", "@sats/payouts"],
  // Server-only libraries that must not be bundled into the client.
  serverExternalPackages: ["@google/genai", "postgres"],
  // Trace files from the monorepo root so the standalone output includes workspace packages.
  outputFileTracingRoot: ROOT,
  poweredByHeader: false,
  reactStrictMode: true,
  env: { NEXT_PUBLIC_DEMO_MODE: process.env.DEMO_MODE ?? "0" },
  async headers() {
    // The CSP itself is set per request in proxy.ts (it needs a fresh nonce).
    return [{ source: "/:path*", headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })) }];
  },
};

export default nextConfig;
