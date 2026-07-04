/**
 * demo.ts — shared demo view-model for the new surfaces.
 * Each block is shaped like its Supabase query (noted inline) so wiring the
 * backend is a drop-in swap. Amounts in millis.
 * NOTE: pages run this data through the REAL engines (detectRecurring,
 * computeBudgetLines, netWorthSeries, goalView) — nothing below is
 * pre-computed output.
 */

import type { TxnLike } from "@/lib/recurring/detect";
import type { BudgetPeriod } from "@/lib/budget/engine";
import type { Snapshot } from "@/lib/networth";
import type { GoalState } from "@/lib/goals";

export const TODAY = "2026-07-04";

// -- transactions history (feeds detectRecurring) -----------------------------
export const txnHistory: TxnLike[] = [
  { txnDate: "2026-03-15", description: "NETFLIX.COM 866-579-7172", amountMillis: -20_990 },
  { txnDate: "2026-04-15", description: "NETFLIX.COM 866-579-7172", amountMillis: -20_990 },
  { txnDate: "2026-05-15", description: "NETFLIX.COM 866-579-7172", amountMillis: -20_990 },
  { txnDate: "2026-06-15", description: "NETFLIX.COM 866-579-7172", amountMillis: -20_990 },
  { txnDate: "2026-04-03", description: "Spotify P2384AB", amountMillis: -11_990 },
  { txnDate: "2026-05-03", description: "Spotify P9981XY", amountMillis: -11_990 },
  { txnDate: "2026-06-02", description: "Spotify P1123QQ", amountMillis: -11_990 },
  { txnDate: "2026-04-28", description: "BC HYDRO PAYMENT", amountMillis: -96_450 },
  { txnDate: "2026-05-28", description: "BC HYDRO PAYMENT", amountMillis: -102_300 },
  { txnDate: "2026-06-28", description: "BC HYDRO PAYMENT", amountMillis: -98_100 },
  { txnDate: "2026-05-01", description: "FITWORLD GYM", amountMillis: -25_000 },
  { txnDate: "2026-05-15", description: "FITWORLD GYM", amountMillis: -25_000 },
  { txnDate: "2026-05-29", description: "FITWORLD GYM", amountMillis: -25_000 },
  { txnDate: "2026-06-12", description: "FITWORLD GYM", amountMillis: -25_000 },
  { txnDate: "2026-06-26", description: "FITWORLD GYM", amountMillis: -25_000 },
  { txnDate: "2026-05-01", description: "SAVE-ON-FOODS #123", amountMillis: -84_210 },
  { txnDate: "2026-05-29", description: "SAVE-ON-FOODS #123", amountMillis: -142_600 },
  { txnDate: "2026-06-27", description: "SAVE-ON-FOODS #123", amountMillis: -31_050 },
  { txnDate: "2026-06-20", description: "MIKU RESTAURANT", amountMillis: -172_420 },
];

// -- budget_periods join for the open cycle -----------------------------------
export const cycle = { label: "Jun 27 – Jul 24", daysElapsed: 8, cycleDays: 28 };

export const budgetPeriods: BudgetPeriod[] = [
  { categoryId: "rent", categoryName: "Rent", flex: "fixed", budgeted: 2_100_000, rolledIn: 0, spent: 2_100_000, rollover: false },
  { categoryId: "groc", categoryName: "Groceries", flex: "flexible", budgeted: 800_000, rolledIn: 150_000, spent: 412_300, rollover: true },
  { categoryId: "dine", categoryName: "Dining out", flex: "flexible", budgeted: 300_000, rolledIn: -42_000, spent: 274_400, rollover: true },
  { categoryId: "tran", categoryName: "Transport", flex: "flexible", budgeted: 180_000, rolledIn: 0, spent: 98_500, rollover: true },
  { categoryId: "subs", categoryName: "Subscriptions", flex: "fixed", budgeted: 60_000, rolledIn: 0, spent: 32_980, rollover: false },
  { categoryId: "gift", categoryName: "Gifts", flex: "non_monthly", budgeted: 75_000, rolledIn: 150_000, spent: 0, rollover: true },
];

// -- balance_snapshots ---------------------------------------------------------
export const snapshots: Snapshot[] = [
  { accountId: "chq", asOf: "2026-02-01", balanceMillis: 6_120_000, isLiability: false },
  { accountId: "chq", asOf: "2026-03-01", balanceMillis: 6_890_500, isLiability: false },
  { accountId: "chq", asOf: "2026-04-01", balanceMillis: 7_240_000, isLiability: false },
  { accountId: "chq", asOf: "2026-05-01", balanceMillis: 7_610_250, isLiability: false },
  { accountId: "chq", asOf: "2026-06-01", balanceMillis: 8_105_000, isLiability: false },
  { accountId: "chq", asOf: "2026-07-01", balanceMillis: 8_450_250, isLiability: false },
  { accountId: "tfsa", asOf: "2026-02-01", balanceMillis: 21_400_000, isLiability: false },
  { accountId: "tfsa", asOf: "2026-04-01", balanceMillis: 22_150_000, isLiability: false },
  { accountId: "tfsa", asOf: "2026-06-01", balanceMillis: 23_020_000, isLiability: false },
  { accountId: "tfsa", asOf: "2026-07-01", balanceMillis: 23_310_500, isLiability: false },
  { accountId: "visa", asOf: "2026-02-01", balanceMillis: 1_890_000, isLiability: true },
  { accountId: "visa", asOf: "2026-04-01", balanceMillis: 1_540_000, isLiability: true },
  { accountId: "visa", asOf: "2026-06-01", balanceMillis: 1_310_000, isLiability: true },
  { accountId: "visa", asOf: "2026-07-01", balanceMillis: 1_220_100, isLiability: true },
];

export const accountsMeta = [
  { accountId: "chq", name: "TD Chequing", kind: "Chequing" },
  { accountId: "tfsa", name: "Wealthsimple TFSA", kind: "Investment" },
  { accountId: "visa", name: "TD Visa", kind: "Credit card" },
];

// -- goals + goal_progress -------------------------------------------------------
export const goals: GoalState[] = [
  { goalId: "g1", name: "Japan trip", emoji: "🗾", target: 5_000_000, saved: 1_750_000, targetDate: "2027-03-01" },
  { goalId: "g2", name: "Emergency fund", emoji: "🛟", target: 15_000_000, saved: 9_800_000, targetDate: null },
  { goalId: "g3", name: "New laptop", emoji: "💻", target: 2_400_000, saved: 2_400_000, targetDate: "2026-08-01" },
];
