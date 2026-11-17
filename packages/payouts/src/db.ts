import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Postgres client for apps. `prepare: false` keeps it compatible with Supabase's transaction-mode
 * pooler (port 6543). Small pool: serverless functions each hold their own.
 */
export function createDb(databaseUrl: string, o: { max?: number } = {}) {
  const client = postgres(databaseUrl, { prepare: false, max: o.max ?? 3, idle_timeout: 20, connect_timeout: 10 });
  return drizzle(client);
}
