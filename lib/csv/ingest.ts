/**
 * ingest.ts — Smart CSV ingestion & reconciliation pipeline.
 *
 * Flow:
 *   1. Parse the file (PapaParse) and apply the user's saved column map.
 *   2. Currency resolution:
 *        - settled CAD column present  -> use it, ignore foreign columns.
 *        - foreign-only row            -> fetch historical rate for the exact
 *          transaction date, convert, and FLAG the row (fx_estimated).
 *   3. Reconciliation against existing ledger rows:
 *        - Exact Date + Exact Amount   -> auto-merge (silently skipped).
 *        - Near match (±2 days same amount, or same day within $0.05)
 *                                      -> insert as `needs_review`.
 *        - No match                    -> insert as `confirmed`.
 *   4. Paycheck detection is left to the caller: any inserted row whose
 *      kind resolves to 'paycheck' should be passed to register_paycheck().
 */

import Papa from "papaparse";
import { parseToMillis, millisToDb, convertToCad, type Millis } from "@/lib/money";
import { withCache, type FxProvider } from "@/lib/fx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Saved once per bank in csv_mappings.column_map */
export interface ColumnMap {
  date: string;
  description: string;
  amount: string;              // the settled CAD column, if the bank has one
  type?: string;               // debit/credit indicator column
  foreignAmount?: string;      // e.g. "USD$"
  foreignCurrency?: string;    // e.g. "Currency" -> "USD"
}

export interface ExistingLedgerRow {
  txnDate: string;             // YYYY-MM-DD
  amountMillis: Millis;
}

export interface IngestedRow {
  txnDate: string;
  description: string;
  amountCad: string;                       // NUMERIC(14,3)-ready string
  kind: "expense" | "income" | "paycheck";
  status: "confirmed" | "needs_review";
  categoryId?: string;                     // set by auto-categorization rules
  matchedRuleId?: string;
  foreignAmount?: string;
  foreignCurrency?: string;
  fxRate?: number;
  fxEstimated: boolean;
  nearMatchOf?: ExistingLedgerRow;         // surfaced in the review UI
}

export interface IngestResult {
  rows: IngestedRow[];
  merged: number;              // exact duplicates auto-ignored
  flagged: number;             // near matches sent to review
  fxConversions: number;       // rows converted with an estimated rate
}

// ---------------------------------------------------------------------------
// Date normalisation (bank CSVs are wildly inconsistent)
// ---------------------------------------------------------------------------

export function normalizeDate(raw: string, format: string): string {
  const clean = raw.trim();
  const digits = clean.replace(/[^0-9]/g, " ").trim().split(/\s+/).map(Number);
  let y: number, m: number, d: number;

  switch (format) {
    case "MM/DD/YYYY": [m, d, y] = digits; break;
    case "DD/MM/YYYY": [d, m, y] = digits; break;
    case "YYYY-MM-DD":
    default:           [y, m, d] = digits; break;
  }
  if (!y || !m || !d || m > 12 || d > 31) {
    throw new Error(`Unparseable date "${raw}" with format ${format}`);
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

const NEAR_DAYS = 2;         // same amount within ±2 days -> review
const NEAR_AMOUNT = 50;      // same day within 50 millis ($0.05) -> review

export async function ingestCsv(
  fileText: string,
  map: ColumnMap,
  dateFormat: string,
  existing: ExistingLedgerRow[],
  fxProvider: FxProvider,
  /** From compileRules() in lib/rules/categorize.ts — optional. */
  categorize?: (
    description: string,
    amountMillis: Millis
  ) => { categoryId: string; ruleId: string } | null
): Promise<IngestResult> {
  const fx = withCache(fxProvider);

  const parsed = Papa.parse<Record<string, string>>(fileText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length > 0) {
    const fatal = parsed.errors.filter((e) => e.type !== "FieldMismatch");
    if (fatal.length) throw new Error(`CSV parse failed: ${fatal[0].message}`);
  }

  // Index existing rows for O(1) exact-match lookups
  const exactIndex = new Set(existing.map((r) => `${r.txnDate}|${r.amountMillis}`));

  const result: IngestResult = { rows: [], merged: 0, flagged: 0, fxConversions: 0 };

  for (const raw of parsed.data) {
    const txnDate = normalizeDate(raw[map.date] ?? "", dateFormat);
    const description = (raw[map.description] ?? "").trim();

    // -- Currency resolution ------------------------------------------------
    let amountMillis: Millis;
    let fxEstimated = false;
    let fxRate: number | undefined;
    let foreignAmount: string | undefined;
    let foreignCurrency: string | undefined;

    const cadRaw = raw[map.amount];
    const hasSettledCad = cadRaw !== undefined && cadRaw.trim() !== "";

    if (hasSettledCad) {
      // Settled CAD available — foreign columns are provenance only, ignored
      // for math per spec.
      amountMillis = parseToMillis(cadRaw);
    } else if (map.foreignAmount && raw[map.foreignAmount]?.trim()) {
      // Foreign-only row: fetch the historical rate for the EXACT date.
      foreignCurrency = (raw[map.foreignCurrency ?? ""] ?? "USD").trim().toUpperCase();
      const foreignMillis = parseToMillis(raw[map.foreignAmount]);
      fxRate = await fx.historicalRateToCad(foreignCurrency, txnDate);
      amountMillis = convertToCad(foreignMillis, fxRate);
      foreignAmount = millisToDb(foreignMillis);
      fxEstimated = true;                    // ⚠ shown in the UI
      result.fxConversions += 1;
    } else {
      continue; // row has no usable amount — skip
    }

    // Debit/credit column flips the sign when present
    if (map.type && raw[map.type]) {
      const t = raw[map.type].toLowerCase();
      if (t.includes("debit") && amountMillis > 0) amountMillis = -amountMillis;
      if (t.includes("credit") && amountMillis < 0) amountMillis = -amountMillis;
    }

    // -- Reconciliation ------------------------------------------------------
    if (exactIndex.has(`${txnDate}|${amountMillis}`)) {
      result.merged += 1;                    // exact duplicate: auto-merge
      continue;
    }

    const nearMatch = findNearMatch(txnDate, amountMillis, existing);
    const status = nearMatch ? "needs_review" : "confirmed";
    if (nearMatch) result.flagged += 1;

    const match = categorize?.(description, amountMillis) ?? null;

    result.rows.push({
      txnDate,
      description,
      amountCad: millisToDb(amountMillis),
      kind: amountMillis > 0 ? "income" : "expense",
      status,
      categoryId: match?.categoryId,
      matchedRuleId: match?.ruleId,
      foreignAmount,
      foreignCurrency,
      fxRate,
      fxEstimated,
      nearMatchOf: nearMatch ?? undefined,
    });

    // New rows also become dedup candidates for later rows in the same file
    exactIndex.add(`${txnDate}|${amountMillis}`);
    existing.push({ txnDate, amountMillis });
  }

  return result;
}

function findNearMatch(
  date: string,
  amount: Millis,
  existing: ExistingLedgerRow[]
): ExistingLedgerRow | null {
  const t = Date.parse(date);
  for (const row of existing) {
    const dayDiff = Math.abs(t - Date.parse(row.txnDate)) / 86_400_000;
    const amtDiff = Math.abs(amount - row.amountMillis);
    const sameAmountNearby = amtDiff === 0 && dayDiff > 0 && dayDiff <= NEAR_DAYS;
    const nearAmountSameDay = dayDiff === 0 && amtDiff > 0 && amtDiff <= NEAR_AMOUNT;
    if (sameAmountNearby || nearAmountSameDay) return row;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Paycheck anomaly detection (drives the Raise-vs-Bonus intercept)
// ---------------------------------------------------------------------------

export type PaycheckVerdict =
  | { kind: "opens_month" }
  | { kind: "anomaly"; baselineMillis: Millis; deltaMillis: Millis };

export function checkPaycheck(
  amountMillis: Millis,
  baselineMillis: Millis | null,
  tolerancePct = 2
): PaycheckVerdict {
  if (baselineMillis === null) return { kind: "opens_month" }; // first ever
  const delta = amountMillis - baselineMillis;
  const tolerance = Math.abs((baselineMillis * tolerancePct) / 100);
  return Math.abs(delta) <= tolerance
    ? { kind: "opens_month" }
    : { kind: "anomaly", baselineMillis, deltaMillis: delta };
}
