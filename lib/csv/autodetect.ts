/**
 * autodetect.ts — zero-config CSV parsing for onboarding.
 *
 * Unlike the main ingest pipeline (which uses a saved per-bank ColumnMap),
 * onboarding accepts whatever the user drags in. This module:
 *   1. Guesses the date / description / amount columns from headers.
 *   2. Handles split debit/credit column pairs.
 *   3. Normalizes sign (some banks export expenses as positives).
 *   4. Merges MULTIPLE files into one stream, deduping exact
 *      date+amount+description collisions across files.
 */

import Papa from "papaparse";
import { parseToMillis, type Millis } from "@/lib/money";

export interface RawTxn {
  txnDate: string; // YYYY-MM-DD
  description: string;
  amountMillis: Millis; // expenses negative after normalization
}

export interface FileParseResult {
  fileName: string;
  rows: RawTxn[];
  skipped: number;
  error?: string;
}

const HEADER_HINTS = {
  date: /date|posted|transaction\s*d/i,
  description: /desc|detail|narrat|merchant|payee|memo|name/i,
  amount: /amount|value|cad|total/i,
  debit: /debit|withdraw|money\s*out|paid\s*out/i,
  credit: /credit|deposit|money\s*in|paid\s*in/i,
} as const;

function pickHeader(headers: string[], pattern: RegExp, exclude?: string[]): string | null {
  return (
    headers.find((h) => pattern.test(h) && !exclude?.includes(h)) ?? null
  );
}

/** "01/15/2026", "2026-01-15", "15 Jan 2026" -> YYYY-MM-DD (or null). */
export function coerceDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO-ish first
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  // Month-name formats ("15 Jan 2026", "Jan 15, 2026")
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /[a-z]/i.test(s)) {
    return parsed.toISOString().slice(0, 10);
  }

  // Numeric a/b/yyyy — ambiguous MM/DD vs DD/MM; prefer MM/DD, flip if invalid.
  const num = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (num) {
    let [, a, b, y] = num;
    if (y.length === 2) y = `20${y}`;
    let mm = Number(a);
    let dd = Number(b);
    if (mm > 12 && dd <= 12) [mm, dd] = [dd, mm];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  return null;
}

/** Parse a single CSV file's text into normalized transactions. */
export function parseOneCsv(fileName: string, text: string): FileParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const dateCol = pickHeader(headers, HEADER_HINTS.date);
  const descCol = pickHeader(headers, HEADER_HINTS.description, dateCol ? [dateCol] : []);
  const debitCol = pickHeader(headers, HEADER_HINTS.debit);
  const creditCol = pickHeader(headers, HEADER_HINTS.credit);
  const amountCol = pickHeader(
    headers,
    HEADER_HINTS.amount,
    [dateCol, descCol, debitCol, creditCol].filter(Boolean) as string[]
  );

  if (!dateCol || !descCol || (!amountCol && !debitCol)) {
    return {
      fileName,
      rows: [],
      skipped: 0,
      error: `Couldn't find date/description/amount columns (saw: ${headers.join(", ") || "no headers"})`,
    };
  }

  const rows: RawTxn[] = [];
  let skipped = 0;

  for (const raw of parsed.data) {
    const txnDate = coerceDate(raw[dateCol] ?? "");
    const description = (raw[descCol] ?? "").trim();
    if (!txnDate || !description) {
      skipped++;
      continue;
    }

    let amountMillis: Millis;
    try {
      if (debitCol || creditCol) {
        const debit = raw[debitCol ?? ""]?.trim() ? parseToMillis(raw[debitCol!]) : 0;
        const credit = raw[creditCol ?? ""]?.trim() ? parseToMillis(raw[creditCol!]) : 0;
        amountMillis = credit - Math.abs(debit);
        if (debit === 0 && credit === 0) {
          skipped++;
          continue;
        }
      } else {
        const cell = raw[amountCol!];
        if (!cell?.trim()) {
          skipped++;
          continue;
        }
        amountMillis = parseToMillis(cell);
      }
    } catch {
      skipped++;
      continue;
    }

    rows.push({ txnDate, description, amountMillis });
  }

  // Sign heuristic: statements that list expenses as positives have almost
  // no negative rows. If >85% of nonzero amounts are positive AND there was
  // no explicit debit/credit pair, flip so expenses are negative.
  if (!debitCol && rows.length > 0) {
    const positives = rows.filter((r) => r.amountMillis > 0).length;
    if (positives / rows.length > 0.85) {
      for (const r of rows) r.amountMillis = -r.amountMillis;
    }
  }

  return { fileName, rows, skipped };
}

/** Merge many parsed files, deduping exact date+amount+description repeats. */
export function mergeFiles(results: FileParseResult[]): {
  rows: RawTxn[];
  duplicatesDropped: number;
} {
  const seen = new Set<string>();
  const rows: RawTxn[] = [];
  let duplicatesDropped = 0;

  for (const file of results) {
    for (const r of file.rows) {
      const key = `${r.txnDate}|${r.amountMillis}|${r.description.toLowerCase()}`;
      if (seen.has(key)) {
        duplicatesDropped++;
        continue;
      }
      seen.add(key);
      rows.push(r);
    }
  }

  rows.sort((a, b) => a.txnDate.localeCompare(b.txnDate));
  return { rows, duplicatesDropped };
}

/** Distinct YYYY-MM months present in the data (drives the 6-month check). */
export function monthsCovered(rows: RawTxn[]): number {
  return new Set(rows.map((r) => r.txnDate.slice(0, 7))).size;
}
