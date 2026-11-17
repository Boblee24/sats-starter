/** Sats <-> fiat. Prices are whole fiat units per 1 BTC. All sats are integers. */
export type Fiat = "NGN" | "XOF";
export type Rates = { NGN: number; XOF: number; source: "live" | "fallback"; fetchedAt: number };

const SATS_PER_BTC = 100_000_000;

function assertPrice(price: number): void {
  if (!Number.isFinite(price) || price <= 0) throw new RangeError("price must be a positive number");
}

/** Fiat value of `sats`, rounded to whole naira / francs. */
export function satsToFiat(sats: number, btcPrice: number): number {
  if (!Number.isInteger(sats) || sats < 0) throw new RangeError("sats must be a non-negative integer");
  assertPrice(btcPrice);
  return Math.round((sats * btcPrice) / SATS_PER_BTC);
}

/**
 * Sats needed to cover `amount` fiat. Rounds UP so the merchant never receives less than asked;
 * any positive amount is at least 1 sat.
 */
export function fiatToSats(amount: number, btcPrice: number): number {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError("amount must be a non-negative number");
  assertPrice(btcPrice);
  if (amount === 0) return 0;
  const exact = (amount * SATS_PER_BTC) / btcPrice;
  const rounded = Math.round(exact);
  // Treat float noise (1000.0000000001) as exact instead of rounding it up.
  const sats = Math.abs(exact - rounded) < 1e-6 ? rounded : Math.ceil(exact);
  return Math.max(1, sats);
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatFiat(amount: number, currency: Fiat): string {
  const n = nf.format(Math.round(amount));
  return currency === "NGN" ? `₦${n}` : `${n} FCFA`;
}

export function formatSats(sats: number): string {
  return `${nf.format(sats)} ${sats === 1 ? "sat" : "sats"}`;
}

export function priceFor(rates: Pick<Rates, "NGN" | "XOF">, currency: Fiat): number {
  return currency === "NGN" ? rates.NGN : rates.XOF;
}
