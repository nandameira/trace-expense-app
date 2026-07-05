import { netWorthSeries, netWorthDelta } from "@/lib/networth";
import { formatCad } from "@/lib/money";
import { snapshots, accountsMeta } from "../demo";
import { NetWorthChart } from "@/components/networth-chart";

export default function AccountsPage() {
  // Real engine over snapshot data — swap for the balance_snapshots query.
  const series = netWorthSeries(snapshots);
  const latest = series[series.length - 1];
  const delta = netWorthDelta(series, 30);

  const latestByAccount = accountsMeta.map((a) => {
    const snaps = snapshots
      .filter((s) => s.accountId === a.accountId)
      .sort((x, y) => x.asOf.localeCompare(y.asOf));
    const last = snaps[snaps.length - 1];
    return { ...a, balance: last.balanceMillis, isLiability: last.isLiability };
  });

  return (
    <main className="px-6 py-10 lg:px-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-ink-faint">Net worth</p>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="num text-4xl font-semibold tracking-tight">
          {formatCad(latest.netWorth)}
          </h1>
          {delta && (
            <span
              className={`num rounded-full px-2.5 py-1 text-sm font-semibold ${
                delta.deltaMillis >= 0
                  ? "bg-positive-soft text-positive"
                  : "bg-negative-soft text-negative"
              }`}
            >
              {delta.deltaMillis >= 0 ? "+" : ""}
              {formatCad(delta.deltaMillis)} · 30d
            </span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="tile p-4 lg:col-span-8">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Assets − liabilities over time
          </p>
          <div className="mt-4 h-64">
            <NetWorthChart
              data={series.map((p) => ({
                date: p.date,
                netWorth: Math.round(p.netWorth / 10) / 100,
              }))}
            />
          </div>
        </section>

        <section className="tile p-4 lg:col-span-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Accounts
          </p>
          <ul className="mt-3 divide-y divide-line">
            {latestByAccount.map((a) => (
              <li key={a.accountId} className="flex items-center justify-between py-3.5">
                <div>
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-ink-faint">{a.kind}</p>
                </div>
                <p
                  className={`num text-sm font-semibold ${
                    a.isLiability ? "text-negative" : ""
                  }`}
                >
                  {a.isLiability ? "−" : ""}
                  {formatCad(a.balance)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-faint">
            Balances come from CSV closing balances or manual snapshots —
            add one any time an account statement lands.
          </p>
        </section>
      </div>
    </main>
  );
}
