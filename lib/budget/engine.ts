/**
 * engine.ts — budgeting engine (category + flex styles, rollover, forecast).
 *
 * Category budgeting: a limit per category per financial cycle.
 * Flex budgeting: categories carry a flex group (fixed / flexible /
 * non_monthly); the view aggregates to "how much flexible spend is left".
 * Rollover: surplus or deficit chains into the next cycle's `rolledIn`.
 * Forecast: linear pace — projected end-of-cycle spend from days elapsed.
 */

import type { Millis } from "@/lib/money";

export type FlexGroup = "fixed" | "flexible" | "non_monthly";

export interface BudgetPeriod {
  categoryId: string;
  categoryName: string;
  flex: FlexGroup;
  budgeted: Millis;
  rolledIn: Millis;      // may be negative (carried deficit)
  spent: Millis;         // positive magnitude
  rollover: boolean;
}

export interface BudgetLine extends BudgetPeriod {
  available: Millis;     // budgeted + rolledIn - spent
  usedPct: number;       // 0..∞ (100+ = over)
  state: "under" | "warning" | "over";
}

export function computeBudgetLines(periods: BudgetPeriod[]): BudgetLine[] {
  return periods.map((p) => {
    const capacity = p.budgeted + p.rolledIn;
    const available = capacity - p.spent;
    const usedPct = capacity > 0 ? (p.spent / capacity) * 100 : p.spent > 0 ? 999 : 0;
    return {
      ...p,
      available,
      usedPct,
      state: usedPct >= 100 ? "over" : usedPct >= 85 ? "warning" : "under",
    };
  });
}

/** Rollover into the NEXT cycle: surplus (or deficit) = capacity - spent. */
export function rolloverAmount(p: BudgetPeriod): Millis {
  return p.rollover ? p.budgeted + p.rolledIn - p.spent : 0;
}

/** Monarch-style flex summary: one number per group. */
export function flexSummary(lines: BudgetLine[]) {
  const groups: Record<FlexGroup, { budgeted: Millis; spent: Millis; available: Millis }> = {
    fixed: { budgeted: 0, spent: 0, available: 0 },
    flexible: { budgeted: 0, spent: 0, available: 0 },
    non_monthly: { budgeted: 0, spent: 0, available: 0 },
  };
  for (const l of lines) {
    const g = groups[l.flex];
    g.budgeted += l.budgeted + l.rolledIn;
    g.spent += l.spent;
    g.available += l.available;
  }
  return groups;
}

/**
 * Forward-looking forecast: at the current pace, where does this cycle land?
 * daysElapsed/cycleDays come from the dynamic financial month.
 */
export function forecastCycle(
  spentSoFar: Millis,
  daysElapsed: number,
  cycleDays: number
): { projected: Millis; dailyPace: Millis } {
  const safeDays = Math.max(1, daysElapsed);
  const dailyPace = Math.round(spentSoFar / safeDays);
  return { projected: dailyPace * cycleDays, dailyPace };
}
