/** ISO 4217 currencies with non-standard decimal exponents. Defaults to 2 (cents). */
export const CURRENCY_EXPONENTS: Record<string, number> = {
  // Zero decimal places
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0,
  MGA: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three decimal places
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};

/** All monetary values are integer minor units (e.g. cents for EUR/USD). Never use floats. */
export interface Money {
  /** Non-negative integer in minor units (e.g. 100 = €1.00, 5 = €0.05). */
  amount: number;
  /** ISO 4217 currency code, e.g. "EUR", "USD". */
  currency: string;
}

/** Convert a human-readable decimal to integer minor units. Use only at system boundaries (e.g. UI input). */
export function toMinorUnits(decimal: number, currency: string): number {
  const exp = CURRENCY_EXPONENTS[currency] ?? 2;
  return Math.round(decimal * 10 ** exp);
}

/** Convert integer minor units back to a decimal. Use only for display. */
export function fromMinorUnits(minorUnits: number, currency: string): number {
  const exp = CURRENCY_EXPONENTS[currency] ?? 2;
  return minorUnits / 10 ** exp;
}

/** Format a Money value for display using Intl.NumberFormat. */
export function formatMoney(money: Money): string {
  const decimal = fromMinorUnits(money.amount, money.currency);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: money.currency,
  }).format(decimal);
}
