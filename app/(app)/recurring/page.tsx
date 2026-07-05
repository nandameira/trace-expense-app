import { detectRecurring, upcomingBills } from "@/lib/recurring/detect";
import { formatCad, sum } from "@/lib/money";
import { txnHistory, TODAY } from "../demo";

const CADENCE_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export default function RecurringPage() {
  // The real engine runs here — swap txnHistory for the transactions query.
  const detected = detectRecurring(txnHistory);
  const upcoming = upcomingBills(detected, TODAY, 14);
  const monthlyTotal = sum(
    detected.map((d) =>
      d.cadence === "monthly"
        ? d.typicalAmountMillis
        : d.cadence === "biweekly"
          ? Math.round(d.typicalAmountMillis * 2.17)
          : d.cadence === "weekly"
            ? Math.round(d.typicalAmountMillis * 4.35)
            : Math.round(d.typicalAmountMillis / (d.cadence === "quarterly" ? 3 : 12))
    )
  );

  return (
    <main className="px-6 py-10 lg:px-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-ink-faint">Recurring</p>
        <h1 className="type-display tracking-tight">
          Subscriptions & bills
        </h1>
        <p className="num mt-2 text-sm text-ink-soft">
          {detected.length} detected · ≈ {formatCad(monthlyTotal)} per month
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="tile p-4 lg:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Detected from your history
          </p>
          <ul className="mt-3 divide-y divide-line">
            {detected.map((d) => (
              <li key={d.merchantKey} className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.displayName}</p>
                  <p className="text-xs text-ink-faint">
                    {CADENCE_LABEL[d.cadence]} · seen {d.occurrences}× · next{" "}
                    {d.nextExpected}
                  </p>
                </div>
                <span
                  className="num rounded-full bg-trace-soft px-2 py-0.5 text-xs font-semibold text-ink"
                  title="Detection confidence"
                >
                  {Math.round(d.confidence * 100)}%
                </span>
                <p className="num w-24 text-right text-sm font-semibold">
                  {formatCad(d.typicalAmountMillis)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="tile flex flex-col p-6 lg:col-span-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Due in the next 14 days
          </p>
          {upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              Nothing due — enjoy the quiet stretch
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {upcoming.map((u) => (
                <li
                  key={u.displayName + u.nextExpected}
                  className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{u.displayName}</p>
                    <p className="text-xs text-ink-faint">{u.nextExpected}</p>
                  </div>
                  <p className="num text-sm font-semibold">
                    {formatCad(u.typicalAmountMillis)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-auto pt-4 text-xs text-ink-faint">
            Detection requires 3+ charges at a steady cadence with stable
            amounts — grocery runs at the same store won’t trigger it.
          </p>
        </section>
      </div>
    </main>
  );
}
