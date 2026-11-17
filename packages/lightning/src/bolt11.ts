import { decode } from "light-bolt11-decoder";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { AppError } from "@sats/core/errors";

export type Network = "bitcoin" | "testnet" | "signet" | "regtest" | "unknown";

export type DecodedBolt11 = {
  /** Integer sats (floor of msats / 1000), or null for an amountless invoice. */
  sats: number | null;
  msats: number | null;
  paymentHash: string;
  /** Unix seconds */
  createdAt: number;
  /** Unix seconds */
  expiresAt: number;
  network: Network;
  description?: string;
};

const HEX64 = /^[0-9a-f]{64}$/;

function networkOf(invoice: string): Network {
  // Order matters: lnbcrt before lnbc, lntbs before lntb.
  if (invoice.startsWith("lnbcrt")) return "regtest";
  if (invoice.startsWith("lnbc")) return "bitcoin";
  if (invoice.startsWith("lntbs")) return "signet";
  if (invoice.startsWith("lntb")) return "testnet";
  return "unknown";
}

/** Normalise user input: trim, drop a `lightning:` URI prefix, lowercase. */
export function normalizeBolt11(input: string): string {
  return input.trim().replace(/^lightning:/i, "").toLowerCase();
}

/** Decode a BOLT11 invoice. Throws AppError("INVALID_INVOICE") on anything malformed. */
export function decodeBolt11(input: string): DecodedBolt11 {
  const invoice = normalizeBolt11(input);
  if (invoice.length < 20 || invoice.length > 2000 || !invoice.startsWith("ln")) {
    throw new AppError("INVALID_INVOICE");
  }
  let d: ReturnType<typeof decode>;
  try {
    d = decode(invoice);
  } catch {
    throw new AppError("INVALID_INVOICE");
  }
  let msats: number | null = null;
  let paymentHash = "";
  let timestamp = 0;
  let description: string | undefined;
  for (const s of d.sections) {
    if (s.name === "amount") msats = Number(s.value);
    else if (s.name === "payment_hash") paymentHash = s.value;
    else if (s.name === "timestamp") timestamp = s.value;
    else if (s.name === "description") description = s.value;
  }
  if (!HEX64.test(paymentHash) || !timestamp) throw new AppError("INVALID_INVOICE");
  if (msats !== null && (!Number.isSafeInteger(msats) || msats < 0)) throw new AppError("INVALID_INVOICE");
  return {
    sats: msats === null ? null : Math.floor(msats / 1000),
    msats,
    paymentHash,
    createdAt: timestamp,
    expiresAt: timestamp + (d.expiry ?? 3600),
    network: networkOf(invoice),
    description,
  };
}

/** True iff sha256(preimage) === paymentHash. Both are 32-byte hex strings. */
export function verifyPreimage(preimageHex: string, paymentHashHex: string): boolean {
  const pre = preimageHex.trim().toLowerCase();
  const hash = paymentHashHex.trim().toLowerCase();
  if (!HEX64.test(pre) || !HEX64.test(hash)) return false;
  const actual = bytesToHex(sha256(hexToBytes(pre)));
  // Constant-time-ish compare (both are fixed-length hex).
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

/** sha256 of a hex preimage, as hex. Handy for tests and receipts. */
export function hashPreimage(preimageHex: string): string {
  return bytesToHex(sha256(hexToBytes(preimageHex)));
}
