/**
 * goals.ts — savings goal math (progress, required pace, on-track check).
 */

import type { Millis } from "@/lib/money";

export interface GoalState {
  goalId: string;
  name: string;
  emoji?: string;
  target: Millis;
  saved: Millis;
  targetDate?: string | null;   // YYYY-MM-DD
}

export interface GoalView extends GoalState {
  remaining: Millis;
  progressPct: number;                 // 0..100 (capped)
  monthsLeft: number | null;
  requiredPerMonth: Millis | null;     // to hit target by targetDate
  complete: boolean;
}

export function goalView(g: GoalState, today: string): GoalView {
  const remaining = Math.max(0, g.target - g.saved);
  const progressPct = Math.min(100, (g.saved / g.target) * 100);

  let monthsLeft: number | null = null;
  let requiredPerMonth: Millis | null = null;

  if (g.targetDate) {
    const ms = Date.parse(g.targetDate) - Date.parse(today);
    monthsLeft = Math.max(0, ms / (86_400_000 * 30.44));
    requiredPerMonth =
      remaining === 0
        ? 0
        : monthsLeft < 0.25
          ? remaining // effectively due now
          : Math.ceil(remaining / monthsLeft);
  }

  return {
    ...g,
    remaining,
    progressPct,
    monthsLeft: monthsLeft === null ? null : Math.round(monthsLeft * 10) / 10,
    requiredPerMonth,
    complete: remaining === 0,
  };
}
