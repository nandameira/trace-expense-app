/**
 * data.ts — dashboard view-model, shaped like the real Supabase queries.
 * Swap each block for its query (noted inline) when wiring the backend.
 * All amounts are in millis (thousandths of CAD) — see lib/money.ts.
 */

import type { OpenSplit } from "@/lib/ledger/fifo";

// -- financial_months: current open month + previous closed month ------------
export const monthSummary = {
  label: "Jun 27 – Jul 24",            // dynamic paycheck-to-paycheck cycle
  openedOn: "2026-06-27",
  spendMillis: 3_482_190,              // sum(amount_cad) where kind='expense'
  previousLabel: "May 29 – Jun 26",
  previousSpendMillis: 3_793_550,
};

// -- 14-day spending velocity (sum of expenses per day) ----------------------
export const velocity14d = [
  { day: "Jun 20", spend: 142.3 },
  { day: "Jun 21", spend: 61.0 },
  { day: "Jun 22", spend: 0 },
  { day: "Jun 23", spend: 233.45 },
  { day: "Jun 24", spend: 88.9 },
  { day: "Jun 25", spend: 47.25 },
  { day: "Jun 26", spend: 310.0 },
  { day: "Jun 27", spend: 129.99 },
  { day: "Jun 28", spend: 54.6 },
  { day: "Jun 29", spend: 96.4 },
  { day: "Jun 30", spend: 412.8 },
  { day: "Jul 01", spend: 76.2 },
  { day: "Jul 02", spend: 189.35 },
  { day: "Jul 03", spend: 102.75 },
];

// -- shared_ledger_balance view + oldest open splits (FIFO preview) ----------
export const sharedLedger: { outstandingMillis: number; splits: OpenSplit[] } = {
  outstandingMillis: 612_830,
  splits: [
    {
      splitId: "s1",
      description: "Costco run",
      fifoDate: "2026-06-14",
      createdAt: "2026-06-14T18:02:00Z",
      partnerAmount: 214_380,
      settledAmount: 0,
    },
    {
      splitId: "s2",
      description: "Hydro bill",
      fifoDate: "2026-06-21",
      createdAt: "2026-06-21T09:11:00Z",
      partnerAmount: 96_450,
      settledAmount: 0,
    },
    {
      splitId: "s3",
      description: "Sushi night",
      fifoDate: "2026-06-29",
      createdAt: "2026-06-29T20:44:00Z",
      partnerAmount: 302_000,
      settledAmount: 0,
    },
  ],
};

// -- top categories this cycle ------------------------------------------------
export const topCategories = [
  { name: "Groceries", spendMillis: 942_310, color: "var(--color-trace)" },
  { name: "Dining out", spendMillis: 611_270, color: "var(--color-amber)" },
  { name: "Transport", spendMillis: 388_400, color: "var(--color-positive)" },
];

// -- advisor engine flags ------------------------------------------------------
export const advisorFlags = [
  {
    tone: "warn" as const,
    title: "Dining out is running hot",
    body: "20% above your 3-month average with 21 days left in the cycle.",
  },
  {
    tone: "info" as const,
    title: "1 estimated FX conversion",
    body: "A USD charge on Jul 2 used a fetched historical rate — review it.",
  },
  {
    tone: "good" as const,
    title: "Groceries trending down",
    body: "On pace to finish $84 under last cycle.",
  },
];

// -- most recent transactions (with split + FX state) --------------------------
export const recentTransactions = [
  {
    id: "t1",
    date: "Jul 03",
    description: "Save-On-Foods",
    category: "Groceries",
    amountMillis: -102_750,
    splitPct: 50 as number | null,
    fxEstimated: false,
  },
  {
    id: "t2",
    date: "Jul 02",
    description: "AWS (USD 12.40)",
    category: "Subscriptions",
    amountMillis: -16_930,
    splitPct: null,
    fxEstimated: true,
  },
  {
    id: "t3",
    date: "Jul 02",
    description: "Miku Restaurant",
    category: "Dining out",
    amountMillis: -172_420,
    splitPct: 50,
    fxEstimated: false,
  },
  {
    id: "t4",
    date: "Jul 01",
    description: "TransLink Compass",
    category: "Transport",
    amountMillis: -50_000,
    splitPct: null,
    fxEstimated: false,
  },
];
