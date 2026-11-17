/**
 * Build syntactically valid BOLT11 invoices for tests (TEST ONLY: the signature is zeros, so no
 * wallet would pay them). Lets payout tests use real decodeBolt11 instead of mocking it.
 */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i]!;
  }
  return chk;
}

function bech32Encode(hrp: string, words: number[]): string {
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  const mod = polymod([...expanded, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...words, ...checksum].map((w) => CHARSET[w]).join("")}`;
}

function bytesToWords(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >>> bits) & 31);
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

function intToWords(n: number, minLen = 1): number[] {
  const out: number[] = [];
  while (n > 0) {
    out.unshift(n % 32);
    n = Math.floor(n / 32);
  }
  while (out.length < minLen) out.unshift(0);
  return out;
}

function tagged(letter: string, data: number[]): number[] {
  return [CHARSET.indexOf(letter), ...intToWords(data.length, 2), ...data];
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

export function makeTestInvoice(o: {
  sats: number | null;
  paymentHash: string;
  timestamp?: number;
  expirySec?: number;
  prefix?: "lnbc" | "lntb" | "lntbs" | "lnbcrt";
  description?: string;
}): string {
  const hrp = `${o.prefix ?? "lnbc"}${o.sats === null ? "" : `${o.sats * 10}n`}`;
  const words = [
    ...intToWords(o.timestamp ?? Math.floor(Date.now() / 1000), 7),
    ...tagged("p", bytesToWords(hexToBytes(o.paymentHash))),
    ...tagged("d", bytesToWords(new TextEncoder().encode(o.description ?? "test"))),
    ...tagged("x", intToWords(o.expirySec ?? 3600)),
    ...new Array(104).fill(0),
  ];
  return bech32Encode(hrp, words);
}
