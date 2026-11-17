import { finalizeEvent, getPublicKey, verifyEvent as ntVerify, type Event } from "nostr-tools/pure";
import * as nip19 from "nostr-tools/nip19";
import { SimplePool } from "nostr-tools/pool";
import { hexToBytes } from "@noble/hashes/utils.js";

export type NostrEvent = Event;
export type EventInput = { kind: number; content: string; tags: string[][]; created_at?: number };

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

/** Decode nsec1… or 64-hex into secret key bytes. Throws without echoing the input. */
export function secretKeyFrom(nsecOrHex: string): Uint8Array {
  const s = nsecOrHex.trim();
  if (HEX64.test(s)) return hexToBytes(s);
  try {
    const d = nip19.decode(s);
    if (d.type === "nsec") return d.data;
  } catch {
    /* fall through */
  }
  throw new Error("invalid nostr secret key");
}

export function signWithKey(o: EventInput, sk: Uint8Array): NostrEvent {
  return finalizeEvent(
    { kind: o.kind, content: o.content, tags: o.tags, created_at: o.created_at ?? Math.floor(Date.now() / 1000) },
    sk,
  );
}

/** Server attestations, signed with SERVER_NOSTR_NSEC. */
export function serverSign(o: EventInput, nsec: string): NostrEvent {
  return signWithKey(o, secretKeyFrom(nsec));
}

export function pubkeyOf(nsec: string): string {
  return getPublicKey(secretKeyFrom(nsec));
}

/**
 * Verify id + signature. Works in the browser and on the server.
 * nostr-tools caches the verification result on the object (and on `{...copies}`), so we always
 * verify a FRESH object built from the fields; otherwise a tampered copy could pass.
 */
export function verifyEvent(e: unknown): e is NostrEvent {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  if (
    typeof x.id !== "string" ||
    !HEX64.test(x.id) ||
    typeof x.pubkey !== "string" ||
    !HEX64.test(x.pubkey) ||
    typeof x.sig !== "string" ||
    !HEX128.test(x.sig) ||
    !Number.isSafeInteger(x.kind) ||
    !Number.isSafeInteger(x.created_at) ||
    typeof x.content !== "string" ||
    !Array.isArray(x.tags) ||
    !x.tags.every((t) => Array.isArray(t) && t.every((v) => typeof v === "string"))
  ) {
    return false;
  }
  const fresh: Event = {
    id: x.id,
    pubkey: x.pubkey,
    sig: x.sig,
    kind: x.kind as number,
    created_at: x.created_at as number,
    content: x.content,
    tags: (x.tags as string[][]).map((t) => [...t]),
  };
  try {
    return ntVerify(fresh);
  } catch {
    return false;
  }
}

export function npubEncode(pubkeyHex: string): string {
  return nip19.npubEncode(pubkeyHex);
}

export function npubDecode(npub: string): string | null {
  try {
    const d = nip19.decode(npub.trim());
    return d.type === "npub" ? d.data : null;
  } catch {
    return null;
  }
}

/** First value of a tag, e.g. tagValue(e, "d"). */
export function tagValue(e: Pick<NostrEvent, "tags">, name: string): string | undefined {
  return e.tags.find((t) => t[0] === name)?.[1];
}

/**
 * Publish to relays without ever blocking the main flow for long.
 * Resolves after every relay has answered or `timeoutMs` passes, with the relays that accepted.
 */
export async function publishBestEffort(
  e: NostrEvent,
  relays: string[],
  timeoutMs = 3000,
): Promise<{ ok: string[]; failed: string[] }> {
  const urls = relays.filter((r) => /^wss:\/\//.test(r));
  if (urls.length === 0) return { ok: [], failed: [] };
  const pool = new SimplePool();
  try {
    const timeout = <T>(p: Promise<T>) =>
      Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
    const results = await Promise.allSettled(pool.publish(urls, e).map((p) => timeout(p)));
    const ok: string[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => (r.status === "fulfilled" ? ok : failed).push(urls[i]!));
    return { ok, failed };
  } catch {
    return { ok: [], failed: urls };
  } finally {
    try {
      pool.destroy();
    } catch {
      /* ignore */
    }
  }
}
