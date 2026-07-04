/**
 * networth.ts — net worth over time from balance snapshots.
 *
 * Snapshots are sparse (per-account, per-date). For each date in the union
 * of snapshot dates, carry every account's most recent balance forward and
 * sum: assets minus liabilities. Powers the Net Worth chart + delta chip.
 */

import type { Millis } from "@/lib/money";

export interface Snapshot {
  accountId: string;
  asOf: string;          // YYYY-MM-DD
  balanceMillis: Millis; // stored as positive magnitude for liabilities too
  isLiability: boolean;
}

export interface NetWorthPoint {
  date: string;
  assets: Millis;
  liabilities: Millis;
  netWorth: Millis;
}

export function netWorthSeries(snapshots: Snapshot[]): NetWorthPoint[] {
  if (snapshots.length === 0) return [];

  const dates = [...new Set(snapshots.map((s) => s.asOf))].sort();
  const byAccount = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    if (!byAccount.has(s.accountId)) byAccount.set(s.accountId, []);
    byAccount.get(s.accountId)!.push(s);
  }
  for (const list of byAccount.values()) {
    list.sort((a, b) => a.asOf.localeCompare(b.asOf));
  }

  return dates.map((date) => {
    let assets = 0;
    let liabilities = 0;
    for (const list of byAccount.values()) {
      // latest snapshot on or before `date`
      let latest: Snapshot | null = null;
      for (const s of list) {
        if (s.asOf <= date) latest = s;
        else break;
      }
      if (!latest) continue;
      if (latest.isLiability) liabilities += latest.balanceMillis;
      else assets += latest.balanceMillis;
    }
    return { date, assets, liabilities, netWorth: assets - liabilities };
  });
}

/** Change between the last point and the point closest to `daysAgo` back. */
export function netWorthDelta(
  series: NetWorthPoint[],
  daysAgo = 30
): { deltaMillis: Millis; deltaPct: number } | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const cutoff = new Date(Date.parse(last.date) - daysAgo * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const base =
    [...series].reverse().find((p) => p.date <= cutoff) ?? series[0];
  const deltaMillis = last.netWorth - base.netWorth;
  const deltaPct = base.netWorth !== 0 ? (deltaMillis / Math.abs(base.netWorth)) * 100 : 0;
  return { deltaMillis, deltaPct };
}
