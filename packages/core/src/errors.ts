/** An error with a stable, log-safe code. Messages may contain user data; codes never do. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

const CODE_RE = /^[A-Z][A-Z0-9_]{1,47}$/;

/**
 * Extract a log-safe code from any thrown value. Never returns the message
 * (messages can contain NWC URLs, invoices or user input).
 */
export function errorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && CODE_RE.test(code)) return code;
    const name = (err as { name?: unknown }).name;
    if (name === "AbortError" || name === "TimeoutError") return "TIMEOUT";
  }
  return "UNKNOWN";
}
