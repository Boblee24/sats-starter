/**
 * Browser key management. The secret key lives only in this device's IndexedDB.
 * It is never sent to a server. exportBackup() shows it once so the user can write it down.
 */
import { get, set, del } from "idb-keyval";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import * as nip19 from "nostr-tools/nip19";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { secretKeyFrom, signWithKey, type EventInput, type NostrEvent } from "./index";

export type KeyStore = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
};

const idbStore: KeyStore = { get: (k) => get<string>(k), set: (k, v) => set(k, v), del: (k) => del(k) };

const SK_KEY = "sats:nostr:sk";
const BACKED_UP_KEY = "sats:nostr:backed_up";

export function createKeyManager(store: KeyStore = idbStore) {
  async function secret(): Promise<Uint8Array> {
    const hex = await store.get(SK_KEY);
    if (hex && /^[0-9a-f]{64}$/.test(hex)) return hexToBytes(hex);
    const sk = generateSecretKey();
    await store.set(SK_KEY, bytesToHex(sk));
    return sk;
  }

  return {
    /** Load the device key, creating one on first use. */
    async getOrCreateKey(): Promise<{ pubkey: string; npub: string }> {
      const pubkey = getPublicKey(await secret());
      return { pubkey, npub: nip19.npubEncode(pubkey) };
    },
    /** nsec for the "write this down" screen. Marks the key as backed up. */
    async exportBackup(): Promise<string> {
      const nsec = nip19.nsecEncode(await secret());
      await store.set(BACKED_UP_KEY, "1");
      return nsec;
    },
    async isBackedUp(): Promise<boolean> {
      return (await store.get(BACKED_UP_KEY)) === "1";
    },
    /** Restore from a written-down nsec (replaces the current key). */
    async importBackup(nsec: string): Promise<{ pubkey: string }> {
      const sk = secretKeyFrom(nsec);
      await store.set(SK_KEY, bytesToHex(sk));
      await store.set(BACKED_UP_KEY, "1");
      return { pubkey: getPublicKey(sk) };
    },
    async signEvent(o: EventInput): Promise<NostrEvent> {
      return signWithKey(o, await secret());
    },
    async forget(): Promise<void> {
      await store.del(SK_KEY);
      await store.del(BACKED_UP_KEY);
    },
  };
}

const defaultManager = createKeyManager();
export const getOrCreateKey = defaultManager.getOrCreateKey;
export const exportBackup = defaultManager.exportBackup;
export const isBackedUp = defaultManager.isBackedUp;
export const importBackup = defaultManager.importBackup;
export const signEvent = defaultManager.signEvent;
export const forgetKey = defaultManager.forget;
