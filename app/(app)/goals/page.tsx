import { goalView } from "@/lib/goals";
import { formatCad } from "@/lib/money";
import { goals, TODAY } from "../demo";

export default function GoalsPage() {
  const views = goals.map((g) => goalView(g, TODAY));

  return (
    <main className="px-6 py-10 lg:px-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-ink-faint">Goals</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Saving toward what matters
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {views.map((g) => (
          <section key={g.goalId} className="tile flex flex-col p-6">
            <div className="flex items-start justify-between">
              <p className="text-2xl" aria-hidden>
                {g.emoji}
              </p>
              {g.complete ? (
                <span className="rounded-full bg-positive-soft px-2.5 py-1 text-xs font-semibold text-positive">
                  Funded
                </span>
              ) : (
                <span className="num rounded-full bg-trace-soft px-2.5 py-1 text-xs font-semibold text-trace">
                  {Math.round(g.progressPct)}%
                </span>
              )}
            </div>

            <h2 className="mt-3 text-base font-semibold">{g.name}</h2>
            <p className="num mt-1 text-sm text-ink-soft">
              {formatCad(g.saved)} of {formatCad(g.target)}
            </p>

            <div
              className="mt-4 h-2 w-full rounded-full bg-canvas"
              role="progressbar"
              aria-valuenow={Math.round(g.progressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${g.name} progress`}
            >
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${g.progressPct}%`,
                  background: g.complete
                    ? "var(--color-positive)"
                    : "var(--color-trace)",
                }}
              />
            </div>

            <p className="mt-4 text-xs text-ink-faint">
              {g.complete
                ? "Target reached — nice work."
                : g.requiredPerMonth != null
                  ? `Needs ${formatCad(g.requiredPerMonth)}/mo to land by ${g.targetDate}`
                  : `${formatCad(g.remaining)} to go — no deadline set`}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
