"use client";

import { useState } from "react";
import {
  computeBudgetLines,
  flexSummary,
  forecastCycle,
  type BudgetPeriod,
  type FlexGroup,
} from "@/lib/budget/engine";
import { formatCad, sum } from "@/lib/money";

const stateColor = {
  under: "var(--color-trace)",
  warning: "var(--color-amber)",
  over: "var(--color-negative)",
} as const;

const FLEX_LABELS: Record<FlexGroup, string> = {
  fixed: "Fixed",
  flexible: "Flexible",
  non_monthly: "Non-monthly",
};

export function BudgetView({
  periods,
  cycle,
}: {
  periods: BudgetPeriod[];
  cycle: { label: string; daysElapsed: number; cycleDays: number };
}) {
  const [style, setStyle] = useState<"category" | "flex">("category");
  const lines = computeBudgetLines(periods);

  const totalSpent = sum(lines.map((l) => l.spent));
  const totalCapacity = sum(lines.map((l) => l.budgeted + l.rolledIn));
  const { projected } = forecastCycle(
    totalSpent,
    cycle.daysElapsed,
    cycle.cycleDays
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Summary strip */}
      <section className="tile flex flex-wrap items-center gap-x-10 gap-y-4 p-4 lg:col-span-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Spent
          </p>
          <p className="num text-2xl font-semibold">
            {formatCad(totalSpent)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Budgeted (incl. rollover)
          </p>
          <p className="num text-2xl font-semibold">
            {formatCad(totalCapacity)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Projected at pace
          </p>
          <p
            className={`num text-2xl font-semibold ${
              projected > totalCapacity ? "text-negative" : "text-positive"
            }`}
          >
            {formatCad(projected)}
          </p>
        </div>

        {/* Style toggle — Monarch's two budgeting modes */}
        <div
          role="tablist"
          aria-label="Budget style"
          className="ml-auto flex rounded-full border border-line bg-canvas p-1"
        >
          {(["category", "flex"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={style === s}
              onClick={() => setStyle(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-ink ${
                style === s ? "bg-trace text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {style === "category" ? (
        <section className="tile p-4 lg:col-span-12">
          <ul className="flex flex-col gap-5">
            {lines.map((l) => (
              <li key={l.categoryId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {l.categoryName}
                    {l.rolledIn !== 0 && (
                      <span
                        className={`num rounded-full px-2 py-0.5 text-xs font-semibold ${
                          l.rolledIn > 0
                            ? "bg-positive-soft text-positive"
                            : "bg-negative-soft text-negative"
                        }`}
                        title="Rolled over from last cycle"
                      >
                        {l.rolledIn > 0 ? "+" : ""}
                        {formatCad(l.rolledIn)} rollover
                      </span>
                    )}
                  </span>
                  <span className="num text-ink-soft">
                    {formatCad(l.spent)} of {formatCad(l.budgeted + l.rolledIn)}
                    <span
                      className={`ml-2 font-semibold ${
                        l.available < 0 ? "text-negative" : "text-ink"
                      }`}
                    >
                      {l.available < 0
                        ? `${formatCad(l.available)} over`
                        : `${formatCad(l.available)} left`}
                    </span>
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-2 rounded-full transition-[width]"
                    style={{
                      width: `${Math.min(100, l.usedPct)}%`,
                      background: stateColor[l.state],
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <FlexBoard lines={lines} />
      )}
    </div>
  );
}

function FlexBoard({
  lines,
}: {
  lines: ReturnType<typeof computeBudgetLines>;
}) {
  const groups = flexSummary(lines);
  return (
    <>
      {(Object.keys(groups) as FlexGroup[]).map((g) => {
        const data = groups[g];
        const pct =
          data.budgeted > 0
            ? Math.min(100, (data.spent / data.budgeted) * 100)
            : 0;
        return (
          <section key={g} className="tile flex flex-col p-6 lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
              {FLEX_LABELS[g]}
            </p>
            <p className="num mt-3 text-3xl font-semibold">
              {formatCad(Math.max(0, data.available))}
              <span className="ml-2 text-sm font-medium text-ink-faint">
                left
              </span>
            </p>
            <p className="num mt-1 text-sm text-ink-soft">
              {formatCad(data.spent)} of {formatCad(data.budgeted)}
            </p>
            <div className="mt-4 h-2 w-full rounded-full bg-canvas">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${pct}%`,
                  background:
                    data.available < 0
                      ? "var(--color-negative)"
                      : "var(--color-trace)",
                }}
              />
            </div>
            <ul className="mt-4 flex flex-col gap-1 text-sm text-ink-soft">
              {lines
                .filter((l) => l.flex === g)
                .map((l) => (
                  <li key={l.categoryId} className="flex justify-between">
                    <span>{l.categoryName}</span>
                    <span className="num">{formatCad(l.spent)}</span>
                  </li>
                ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
