"use client";

/**
 * tiles.tsx — the Bento tiles for the Trace Expense dashboard.
 * Client component: Recharts + the interactive Split dropdown live here.
 */

import { useState } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { formatCad, type Millis } from "@/lib/money";
import {
  SPLIT_OPTIONS,
  DEFAULT_SPLIT,
  outstandingBalance,
  type OpenSplit,
} from "@/lib/ledger/fifo";

/* ------------------------------------------------------------------------ */
/* Shared bits                                                              */
/* ------------------------------------------------------------------------ */

function TileLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
      {children}
    </p>
  );
}

function DeltaChip({ pct }: { pct: number }) {
  const good = pct <= 0; // spending down = good
  return (
    <span
      className={`num rounded-full px-2 py-0.5 text-xs font-semibold ${
        good ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative"
      }`}
    >
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* 1. Hero — current cycle spend vs previous, with the signature trace line */
/* ------------------------------------------------------------------------ */

export function HeroSpendTile({
  summary,
}: {
  summary: {
    label: string;
    spendMillis: Millis;
    previousLabel: string;
    previousSpendMillis: Millis;
  };
}) {
  const deltaPct =
    ((summary.spendMillis - summary.previousSpendMillis) /
      summary.previousSpendMillis) *
    100;

  return (
    <section className="tile relative flex h-full flex-col justify-between overflow-hidden p-6">
      <div className="flex items-start justify-between">
        <TileLabel>Spent this cycle</TileLabel>
        <DeltaChip pct={deltaPct} />
      </div>

      <div className="relative z-10 mt-6">
        <p className="num text-5xl font-semibold tracking-tight">
          {formatCad(Math.abs(summary.spendMillis))}
        </p>
        <p className="num mt-2 text-sm text-ink-soft">
          vs {formatCad(Math.abs(summary.previousSpendMillis))} last cycle (
          {summary.previousLabel})
        </p>
      </div>

      {/* Signature: a single continuous trace line running under the number */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full"
        viewBox="0 0 400 96"
        preserveAspectRatio="none"
      >
        <path
          d="M0 70 C 40 70, 55 34, 90 40 S 150 80, 190 62 S 250 18, 300 34 S 370 60, 400 44"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M0 70 C 40 70, 55 34, 90 40 S 150 80, 190 62 S 250 18, 300 34 S 370 60, 400 44 L 400 96 L 0 96 Z"
          fill="var(--color-ink)"
          opacity="0.06"
        />
      </svg>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* 2. 14-day spending velocity sparkline                                    */
/* ------------------------------------------------------------------------ */

export function VelocityTile({
  data,
}: {
  data: { day: string; spend: number }[];
}) {
  const total = data.reduce((a, d) => a + d.spend, 0);
  return (
    <section className="tile flex h-full flex-col p-6">
      <TileLabel>Velocity · last 14 days</TileLabel>
      <p className="num mt-3 text-2xl font-semibold">
        {formatCad(Math.round(total * 1000))}
      </p>
      <div className="mt-3 min-h-20 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="traceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-ink)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--color-ink)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" hide />
            <Tooltip
              cursor={{ stroke: "var(--color-line)" }}
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="tile num px-3 py-1.5 text-xs font-medium">
                    {payload[0].payload.day} ·{" "}
                    {formatCad(Math.round((payload[0].value as number) * 1000))}
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="spend"
              stroke="var(--color-ink)"
              strokeWidth={2}
              fill="url(#traceFill)"
              dot={false}
              activeDot={{ r: 3, fill: "var(--color-ink)", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* 3. Shared ledger — partner balance + FIFO next-to-settle                 */
/* ------------------------------------------------------------------------ */

export function SharedLedgerTile({
  ledger,
}: {
  ledger: { outstandingMillis: Millis; splits: OpenSplit[] };
}) {
  const oldest = [...ledger.splits].sort((a, b) =>
    a.fifoDate.localeCompare(b.fifoDate)
  )[0];
  const openCount = ledger.splits.filter(
    (s) => s.settledAmount < s.partnerAmount
  ).length;

  return (
    <section className="tile flex h-full flex-col p-6">
      <div className="flex items-start justify-between">
        <TileLabel>Shared ledger</TileLabel>
        <span className="rounded-full bg-trace-soft px-2 py-0.5 text-xs font-semibold text-ink">
          FIFO
        </span>
      </div>

      <p className="num mt-3 text-3xl font-semibold">
        {formatCad(outstandingBalance(ledger.splits))}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Partner owes across {openCount} open{" "}
        {openCount === 1 ? "expense" : "expenses"}
      </p>

      {oldest && (
        <div className="mt-4 rounded-xl border border-line bg-canvas px-4 py-3">
          <p className="text-xs font-medium text-ink-faint">
            Next wire settles first
          </p>
          <p className="num mt-0.5 text-sm font-medium">
            {oldest.description} ·{" "}
            {formatCad(oldest.partnerAmount - oldest.settledAmount)}
            <span className="text-ink-faint"> · {oldest.fifoDate}</span>
          </p>
        </div>
      )}

      <button className="mt-auto pt-4 text-left text-sm font-semibold text-ink transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trace">
        Record reimbursement →
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* 4. Top 3 categories                                                      */
/* ------------------------------------------------------------------------ */

export function TopCategoriesTile({
  categories,
  totalMillis,
}: {
  categories: { name: string; spendMillis: Millis; color: string }[];
  totalMillis: Millis;
}) {
  return (
    <section className="tile flex h-full flex-col p-6">
      <TileLabel>Top categories</TileLabel>
      <ul className="mt-4 flex flex-1 flex-col justify-center gap-5">
        {categories.map((c) => {
          const pct = Math.round((c.spendMillis / Math.abs(totalMillis)) * 100);
          return (
            <li key={c.name}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="num text-ink-soft">
                  {formatCad(c.spendMillis)}
                  <span className="ml-1.5 text-xs text-ink-faint">{pct}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-canvas">
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${pct}%`, background: c.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* 5. Advisor engine                                                        */
/* ------------------------------------------------------------------------ */

const toneStyles = {
  warn: "bg-amber-soft text-amber",
  info: "bg-trace-soft text-ink",
  good: "bg-positive-soft text-positive",
} as const;

export function AdvisorTile({
  flags,
}: {
  flags: { tone: keyof typeof toneStyles; title: string; body: string }[];
}) {
  return (
    <section className="tile flex h-full flex-col p-6">
      <TileLabel>Advisor</TileLabel>
      <ul className="mt-4 flex flex-col gap-3">
        {flags.map((f) => (
          <li key={f.title} className="flex gap-3">
            <span
              className={`mt-0.5 h-5 w-5 shrink-0 rounded-full text-center text-xs leading-5 font-bold ${toneStyles[f.tone]}`}
              aria-hidden
            >
              {f.tone === "warn" ? "!" : f.tone === "good" ? "✓" : "i"}
            </span>
            <div>
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="text-sm text-ink-soft">{f.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* 6. Recent transactions with the Split dropdown + FX warning              */
/* ------------------------------------------------------------------------ */

/* ------------------------------------------------------------------------ */
/* 7. Net worth (assets − liabilities over time)                            */
/* ------------------------------------------------------------------------ */

export function NetWorthTile({
  series,
  delta,
}: {
  series: { date: string; netWorth: number }[];
  delta: { deltaMillis: Millis; deltaPct: number } | null;
}) {
  const latest = series[series.length - 1];
  return (
    <section className="tile flex h-full flex-col p-6">
      <div className="flex items-start justify-between">
        <TileLabel>Net worth</TileLabel>
        {delta && (
          <span
            className={`num rounded-full px-2 py-0.5 text-xs font-semibold ${
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
      <p className="num mt-3 text-3xl font-semibold">
        {formatCad(Math.round(latest.netWorth * 1000))}
      </p>
      <div className="mt-3 min-h-24 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="nwTileFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-ink)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--color-ink)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <Tooltip
              cursor={{ stroke: "var(--color-line)" }}
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="tile num px-3 py-1.5 text-xs font-medium">
                    {payload[0].payload.date} · $
                    {(payload[0].value as number).toLocaleString("en-CA")}
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke="var(--color-ink)"
              strokeWidth={2}
              fill="url(#nwTileFill)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* 8. Upcoming bills (from recurring detection)                             */
/* ------------------------------------------------------------------------ */

export function UpcomingBillsTile({
  bills,
}: {
  bills: { displayName: string; typicalAmountMillis: Millis; nextExpected: string }[];
}) {
  return (
    <section className="tile flex h-full flex-col p-6">
      <div className="flex items-baseline justify-between">
        <TileLabel>Upcoming bills · 14 days</TileLabel>
        <a href="/recurring" className="text-sm font-medium text-ink-soft hover:text-ink">
          Manage
        </a>
      </div>
      {bills.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Nothing due in this window — enjoy the calm 🌿</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {bills.map((b) => (
            <li
              key={b.displayName + b.nextExpected}
              className="flex items-center justify-between py-3"
            >
              <div>
                <p className="text-sm font-medium">{b.displayName}</p>
                <p className="text-xs text-ink-faint">{b.nextExpected}</p>
              </div>
              <p className="num text-sm font-semibold">
                {formatCad(b.typicalAmountMillis)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Txn = {
  id: string;
  date: string;
  description: string;
  category: string;
  amountMillis: Millis;
  splitPct: number | null;
  fxEstimated: boolean;
};

export function RecentTransactionsTile({ transactions }: { transactions: Txn[] }) {
  const [splits, setSplits] = useState<Record<string, number | null>>(
    Object.fromEntries(transactions.map((t) => [t.id, t.splitPct]))
  );

  const toggleSplit = (id: string) =>
    setSplits((s) => ({ ...s, [id]: s[id] === null ? DEFAULT_SPLIT : null }));

  const setPct = (id: string, pct: number) =>
    setSplits((s) => ({ ...s, [id]: pct }));

  return (
    <section className="tile flex h-full flex-col p-6">
      <div className="flex items-baseline justify-between">
        <TileLabel>Recent</TileLabel>
        <a
          href="/transactions"
          className="text-sm font-medium text-ink-soft hover:text-ink"
        >
          View all
        </a>
      </div>

      <ul className="mt-3 divide-y divide-line">
        {transactions.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                {t.description}
                {t.fxEstimated && (
                  <span
                    title="Converted with a fetched historical FX rate — estimate"
                    className="rounded bg-amber-soft px-1 text-[10px] font-bold text-amber"
                  >
                    ⚠ FX
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-faint">
                {t.date} · {t.category}
              </p>
            </div>

            {/* Split control: toggled = your kept %, remainder → shared ledger */}
            {splits[t.id] === null ? (
              <button
                onClick={() => toggleSplit(t.id)}
                className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-ink-soft transition-colors hover:border-trace hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trace"
              >
                Split
              </button>
            ) : (
              <select
                aria-label={`Your share of ${t.description}`}
                value={splits[t.id]!}
                onChange={(e) => setPct(t.id, Number(e.target.value))}
                className="num rounded-full border border-trace bg-trace-soft px-2 py-1 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trace"
              >
                {SPLIT_OPTIONS.map((pct) => (
                  <option key={pct} value={pct}>
                    {pct}%
                  </option>
                ))}
              </select>
            )}

            <p className="num w-24 text-right text-sm font-semibold">
              {formatCad(t.amountMillis)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
