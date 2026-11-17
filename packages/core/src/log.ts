/**
 * Allowlisted structured logger. The ONLY way to log in sats-* apps (eslint bans console).
 *
 * It accepts a fixed set of fields with primitive values. Anything else is dropped:
 * no request bodies, IPs, coordinates, images, audio, transcripts, NWC strings or free-form objects.
 */
export const ALLOWED_FIELDS = ["event", "id", "paymentHash", "latencyMs", "status", "code", "count"] as const;
export type AllowedField = (typeof ALLOWED_FIELDS)[number];
export type LogFields = Partial<Record<Exclude<AllowedField, "event">, string | number | boolean>>;
export type LogLevel = "info" | "warn" | "error";
export type LogRecord = { level: LogLevel; ts: string; event: string } & LogFields;
export type LogSink = (rec: LogRecord) => void;

const ALLOWED = new Set<string>(ALLOWED_FIELDS);
const EVENT_RE = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;
// Short, identifier-like strings only. Anything that could be a URL, an invoice or prose is dropped.
const SAFE_STRING_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

/** Keep only allowlisted fields with safe primitive values. Exported for tests. */
export function sanitize(fields: Record<string, unknown> | undefined): LogFields {
  const out: Record<string, string | number | boolean> = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED.has(k) || k === "event") continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && SAFE_STRING_RE.test(v)) out[k] = v;
  }
  return out as LogFields;
}

const defaultSink: LogSink = (rec) => {
  const line = JSON.stringify(rec);
  /* eslint-disable no-console */
  if (rec.level === "error") console.error(line);
  else if (rec.level === "warn") console.warn(line);
  else console.log(line);
  /* eslint-enable no-console */
};
let sink: LogSink = defaultSink;

/** Replace the output sink (tests). Returns a function that restores the previous sink. */
export function setLogSink(next: LogSink): () => void {
  const prev = sink;
  sink = next;
  return () => {
    sink = prev;
  };
}

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  const safeEvent = EVENT_RE.test(event) ? event : "invalid_event";
  sink({ level, ts: new Date().toISOString(), event: safeEvent, ...sanitize(fields as Record<string, unknown>) });
}

export const log = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};
