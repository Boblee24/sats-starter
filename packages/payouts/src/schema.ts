import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const rewards = pgTable(
  "rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pubkey: text("pubkey").notNull(),
    sats: integer("sats").notNull(),
    reason: text("reason").notNull(),
    sourceId: text("source_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rewards_pubkey_idx").on(t.pubkey)],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pubkey: text("pubkey").notNull(),
    sats: integer("sats").notNull(),
    paymentHash: text("payment_hash").notNull().unique(),
    bolt11: text("bolt11").notNull(),
    /** pending | paid | failed */
    status: text("status").notNull(),
    code: text("code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("claims_pubkey_idx").on(t.pubkey), index("claims_created_idx").on(t.createdAt)],
);

/**
 * Idempotent DDL matching the Drizzle tables above (the tests run every query against it,
 * so they can't drift silently). Apps run it from their migrate step.
 */
export const PAYOUTS_SQL = `
CREATE TABLE IF NOT EXISTS rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pubkey text NOT NULL,
  sats integer NOT NULL CHECK (sats > 0),
  reason text NOT NULL,
  source_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rewards_pubkey_idx ON rewards (pubkey);

CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pubkey text NOT NULL,
  sats integer NOT NULL CHECK (sats > 0),
  payment_hash text NOT NULL UNIQUE,
  bolt11 text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claims_pubkey_idx ON claims (pubkey);
CREATE INDEX IF NOT EXISTS claims_created_idx ON claims (created_at);
`;
