import type { WalletInfo } from "./types";

function codeOf(err: unknown): string | undefined {
  const c = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  return typeof c === "string" ? c : undefined;
}

/** NWC QUOTA_EXCEEDED: the connection's budget is used up. */
export function isQuotaExceeded(err: unknown): boolean {
  return codeOf(err) === "QUOTA_EXCEEDED";
}

/**
 * NIP-47 wallet error codes that mean the payment definitely did NOT happen.
 * Anything else (timeouts, relay drops, INTERNAL, OTHER) is ambiguous: money may have left.
 * Note: @getalby/sdk v9 reports reply/publish timeouts with code "INTERNAL", so the code alone
 * can't distinguish them; we also require the error to be a wallet response (Nip47WalletError).
 */
const DEFINITIVE_CODES = new Set([
  "QUOTA_EXCEEDED",
  "INSUFFICIENT_BALANCE",
  "PAYMENT_FAILED",
  "RESTRICTED",
  "UNAUTHORIZED",
  "NOT_IMPLEMENTED",
  "RATE_LIMITED",
]);

/**
 * Normalised error thrown by every Wallet method. `walletResponse` is true only when the wallet
 * itself answered with an error (as opposed to a timeout, relay or decoding problem).
 * The message is a fixed string: SDK messages can echo relay URLs, so they're never kept.
 */
export class LightningError extends Error {
  constructor(
    public readonly code: string,
    public readonly walletResponse: boolean,
  ) {
    super(`lightning error ${code}`);
    this.name = "LightningError";
  }
}

export function isDefinitivePayFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const isWalletResponse =
    (err as { walletResponse?: unknown }).walletResponse === true ||
    (err as { constructor?: { name?: string } }).constructor?.name === "Nip47WalletError";
  const code = codeOf(err);
  return isWalletResponse && code !== undefined && DEFINITIVE_CODES.has(code);
}

const SPEND_METHODS = ["pay_invoice", "pay_keysend", "multi_pay_invoice", "multi_pay_keysend"];

/** True if the connection can move money out. */
export function canSpend(info: Pick<WalletInfo, "methods">): boolean {
  return info.methods.some((m) => SPEND_METHODS.includes(m));
}

/**
 * Check a connection's permissions.
 * - missing: methods in `allow` the wallet doesn't grant
 * - extra: methods granted beyond `allow` (always includes any forbidden ones present)
 * - ok: nothing missing and nothing forbidden granted
 */
export function assertPermissions(
  info: Pick<WalletInfo, "methods">,
  o: { allow: string[]; forbid: string[] },
): { ok: boolean; extra: string[]; missing: string[]; forbidden: string[] } {
  const granted = new Set(info.methods);
  const missing = o.allow.filter((m) => !granted.has(m));
  const extra = info.methods.filter((m) => !o.allow.includes(m));
  const forbidden = o.forbid.filter((m) => granted.has(m));
  return { ok: missing.length === 0 && forbidden.length === 0, extra, missing, forbidden };
}
