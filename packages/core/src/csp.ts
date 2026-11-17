/**
 * Content-Security-Policy builder shared by every app (see starter BUILD_ORDER Phase 5).
 * Pure function: the app's proxy.ts passes a fresh nonce per request.
 */
export type CspExtra = {
  connect?: string[];
  img?: string[];
  worker?: string[];
  media?: string[];
  style?: string[];
};

const ORIGIN_RE = /^(wss|https):\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

/** Keep only exact wss:// or https:// origins (no paths, wildcards or bare schemes). */
export function cleanOrigins(list: Array<string | undefined>): string[] {
  const out = new Set<string>();
  for (const raw of list) {
    for (const item of (raw ?? "").split(",")) {
      const s = item.trim();
      if (!s) continue;
      try {
        const u = new URL(s);
        const origin = `${u.protocol}//${u.host}`;
        if (ORIGIN_RE.test(origin)) out.add(origin);
      } catch {
        /* drop invalid */
      }
    }
  }
  return [...out];
}

export function buildCsp(o: { nonce: string; dev?: boolean; relays?: string[]; extra?: CspExtra }): string {
  const relays = cleanOrigins(o.relays ?? []);
  const extra = o.extra ?? {};
  const join = (...xs: Array<string[] | undefined>) => xs.flatMap((x) => x ?? []).join(" ");
  const directives: Array<[string, string]> = [
    ["default-src", "'self'"],
    ["script-src", `'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ""}`],
    ["style-src", join(["'self'", `'nonce-${o.nonce}'`], extra.style)],
    // React/SVG libraries set style="" attributes; nonces can't cover attributes.
    ["style-src-attr", "'unsafe-inline'"],
    ["img-src", join(["'self'", "data:", "blob:"], extra.img)],
    ["media-src", join(["'self'", "blob:"], extra.media)],
    ["font-src", "'self'"],
    ["connect-src", join(["'self'"], relays, cleanOrigins(extra.connect ?? []), o.dev ? ["ws:"] : [])],
    ["worker-src", join(["'self'"], extra.worker)],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  if (!o.dev) directives.push(["upgrade-insecure-requests", ""]);
  return directives.map(([k, v]) => (v ? `${k} ${v}` : k)).join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(self), geolocation=(self), microphone=(), payment=()",
};
