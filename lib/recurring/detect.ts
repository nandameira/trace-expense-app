/**
 * detect.ts — recurring subscription & bill detection.
 *
 * Approach (Monarch-style, offline):
 *   1. Normalize merchant strings ("NETFLIX.COM 866-579-7172" -> "netflix").
 *   2. Group expense history by merchant key.
 *   3. For groups with >= MIN_OCCURRENCES, measure the gaps between charges
 *      and match them to a known cadence (weekly/biweekly/monthly/quarterly/
 *      yearly) within a per-cadence day tolerance.
 *   4. Require amount stability (median absolute deviation <= 25% of median)
 *      so grocery runs at the same store don't register as subscriptions.
 *   5. Emit a candidate with typical amount + predicted next date.
 */

import type { Millis } from "@/lib/money";

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface TxnLike {
  txnDate: string;        // YYYY-MM-DD
  description: string;
  amountMillis: Millis;   // expenses negative
}

export interface RecurringCandidate {
  merchantKey: string;
  displayName: string;
  cadence: Cadence;
  typicalAmountMillis: Millis;   // positive magnitude
  occurrences: number;
  lastSeen: string;
  nextExpected: string;
  confidence: number;            // 0..1
}

const MIN_OCCURRENCES = 3;

const CADENCES: { name: Cadence; days: number; tolerance: number }[] = [
  { name: "weekly", days: 7, tolerance: 2 },
  { name: "biweekly", days: 14, tolerance: 3 },
  { name: "monthly", days: 30.44, tolerance: 5 },
  { name: "quarterly", days: 91.3, tolerance: 9 },
  { name: "yearly", days: 365.25, tolerance: 15 },
];

/** "NETFLIX.COM 866-579-7172 ON" -> "netflix com" -> "netflix" */
export function normalizeMerchant(description: string): string {
  return (
    description
      .toLowerCase()
      // strip long digit runs (phone numbers, store #s, auth codes)
      .replace(/\d{3,}/g, " ")
      .replace(/[^a-z\s]/g, " ")
      // strip common bank-feed noise words
      .replace(/\b(pos|purchase|payment|pay|www|com|inc|ltd|corp|on|bc|ab|qc)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      // drop short leftovers from stripped reference codes ("p", "ab", "x7")
      .filter((tok) => tok.length >= 3)
      .slice(0, 3) // first few meaningful tokens identify the merchant
      .join(" ")
  );
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/** Pretty display name from the most recent raw description. */
function displayNameFrom(key: string): string {
  return key
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function detectRecurring(transactions: TxnLike[]): RecurringCandidate[] {
  // Only expenses participate
  const groups = new Map<string, TxnLike[]>();
  for (const t of transactions) {
    if (t.amountMillis >= 0) continue;
    const key = normalizeMerchant(t.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [key, txns] of groups) {
    if (txns.length < MIN_OCCURRENCES) continue;
    txns.sort((a, b) => a.txnDate.localeCompare(b.txnDate));

    // Gaps between consecutive charges
    const gaps: number[] = [];
    for (let i = 1; i < txns.length; i++) {
      gaps.push(daysBetween(txns[i - 1].txnDate, txns[i].txnDate));
    }
    const medGap = median(gaps);

    // Match a cadence
    const cadence = CADENCES.find(
      (c) => Math.abs(medGap - c.days) <= c.tolerance
    );
    if (!cadence) continue;

    // Every individual gap must roughly agree (allows one skipped/rebilled)
    const agreeing = gaps.filter(
      (g) => Math.abs(g - cadence.days) <= cadence.tolerance
    ).length;
    if (agreeing < gaps.length - 1) continue;

    // Amount stability: MAD within 25% of median magnitude
    const amounts = txns.map((t) => Math.abs(t.amountMillis));
    const medAmount = median(amounts);
    const mad = median(amounts.map((a) => Math.abs(a - medAmount)));
    if (medAmount === 0 || mad / medAmount > 0.25) continue;

    const last = txns[txns.length - 1];
    candidates.push({
      merchantKey: key,
      displayName: displayNameFrom(key),
      cadence: cadence.name,
      typicalAmountMillis: Math.round(medAmount),
      occurrences: txns.length,
      lastSeen: last.txnDate,
      nextExpected: addDays(last.txnDate, Math.round(cadence.days)),
      confidence:
        Math.min(1, txns.length / 6) * (agreeing / gaps.length),
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/** Bills expected within the next `withinDays` — powers the dashboard tile. */
export function upcomingBills(
  items: { displayName: string; typicalAmountMillis: Millis; nextExpected: string }[],
  today: string,
  withinDays = 14
) {
  const horizon = addDays(today, withinDays);
  return items
    .filter((i) => i.nextExpected >= today && i.nextExpected <= horizon)
    .sort((a, b) => a.nextExpected.localeCompare(b.nextExpected));
}
