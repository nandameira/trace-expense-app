import {
  monthSummary,
  velocity14d,
  sharedLedger,
  topCategories,
  advisorFlags,
  recentTransactions,
} from "./data";
import {
  HeroSpendTile,
  VelocityTile,
  SharedLedgerTile,
  TopCategoriesTile,
  AdvisorTile,
  RecentTransactionsTile,
  NetWorthTile,
  UpcomingBillsTile,
} from "@/components/dashboard/tiles";
import { netWorthSeries, netWorthDelta } from "@/lib/networth";
import { detectRecurring, upcomingBills } from "@/lib/recurring/detect";
import { snapshots, txnHistory, TODAY } from "../demo";

export default function DashboardPage() {
  // Real engines over demo data — swap the demo module for Supabase queries.
  const nwSeries = netWorthSeries(snapshots).map((p) => ({
    date: p.date,
    netWorth: Math.round(p.netWorth / 10) / 100,
  }));
  const nwDelta = netWorthDelta(netWorthSeries(snapshots), 30);
  const bills = upcomingBills(detectRecurring(txnHistory), TODAY, 14);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* Header — the cycle label is the dynamic paycheck-to-paycheck month */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-faint">Trace Expense</p>
          <h1 className="type-display tracking-tight">
            Current cycle
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line bg-card px-4 py-1.5 text-sm font-medium text-ink-soft">
            {monthSummary.label}
          </span>
          <button className="btn-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            Import CSV
          </button>
        </div>
      </header>

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-6 lg:grid-cols-12">
        <div className="md:col-span-6 lg:col-span-5">
          <HeroSpendTile summary={monthSummary} />
        </div>
        <div className="md:col-span-3 lg:col-span-3">
          <VelocityTile data={velocity14d} />
        </div>
        <div className="md:col-span-3 lg:col-span-4">
          <SharedLedgerTile ledger={sharedLedger} />
        </div>

        <div className="md:col-span-3 lg:col-span-4">
          <TopCategoriesTile
            categories={topCategories}
            totalMillis={monthSummary.spendMillis}
          />
        </div>
        <div className="md:col-span-3 lg:col-span-4">
          <AdvisorTile flags={advisorFlags} />
        </div>
        <div className="md:col-span-6 lg:col-span-4">
          <RecentTransactionsTile transactions={recentTransactions} />
        </div>

        <div className="md:col-span-3 lg:col-span-6">
          <NetWorthTile series={nwSeries} delta={nwDelta} />
        </div>
        <div className="md:col-span-3 lg:col-span-6">
          <UpcomingBillsTile bills={bills} />
        </div>
      </div>
    </main>
  );
}
