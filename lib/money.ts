/**
 * money.ts — high-precision currency math for Trace Expense.
 *
 * Strategy: all amounts move through the app as integer "millis"
 * (thousandths of a dollar). This gives the mandated 3-decimal storage
 * precision without floating-point drift, while staying ergonomic —
 * no BigNumber dependency required for CAD-scale values.
 *
 *   $12.345  ->  12345 millis  ->  stored as NUMERIC(14,3) "12.345"
 *   UI render rounds to 2 dp:  "$12.35"
 */

export type Millis = number; // integer thousandths of a CAD dollar

/** Parse a raw CSV/user string ("1,234.56", "-$40.00", "(40.00)") into millis. */
export function parseToMillis(raw: string | number): Millis {
  if (typeof raw === "number") return Math.round(raw * 1000);
  let s = raw.trim();
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[($)]/g, "").replace(/[,\s]/g, "").replace(/^-/, "");
  const value = Number.parseFloat(s);
  if (Number.isNaN(value)) throw new Error(`Unparseable amount: "${raw}"`);
  const millis = Math.round(value * 1000);
  return negative ? -millis : millis;
}

/** Millis -> "12.345" string for NUMERIC(14,3) columns. */
export function millisToDb(m: Millis): string {
  const sign = m < 0 ? "-" : "";
  const abs = Math.abs(m);
  return `${sign}${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, "0")}`;
}

/** NUMERIC(14,3) string from the DB -> millis. */
export function dbToMillis(db: string | number): Millis {
  return parseToMillis(String(db));
}

/** Multiply millis by a percentage (e.g. split share), banker-safe rounding. */
export function pctOf(m: Millis, pct: number): Millis {
  return Math.round((m * pct) / 100);
}

/** Convert a foreign-currency amount to CAD millis using an FX rate. */
export function convertToCad(foreignMillis: Millis, rate: number): Millis {
  return Math.round(foreignMillis * rate);
}

/** Render for the UI: round HALF-UP to 2 dp, locale-formatted. */
export function formatCad(m: Millis, opts?: { sign?: boolean }): string {
  const dollars = Math.round(m / 10) / 100; // millis -> cents -> dollars
  const str = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(dollars));
  const sign = m < 0 ? "−" : opts?.sign ? "+" : "";
  return `${sign}${str}`;
}

export const sum = (values: Millis[]): Millis => values.reduce((a, b) => a + b, 0);
