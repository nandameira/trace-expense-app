/**
 * generate.ts — turn raw transaction history into a suggested budget.
 *
 * Pipeline:
 *   1. Classify each expense into a logical category via keyword patterns
 *      over the normalized merchant string.
 *   2. Average each category's spend across the months actually observed
 *      in the data (a category absent in a month counts as $0 for it).
 *   3. Suggest a monthly limit: the average rounded UP to a friendly step
 *      ($25 for larger categories, $5 for small ones) with a little
 *      headroom so users don't start life over budget.
 *   4. Assign each category a distinct, persistent data color.
 *
 * Note on palette: the app chrome is monochrome + one accent, but category
 * colors are DATA colors — they exist to tell series apart in charts, so
 * they intentionally use a muted multi-hue palette.
 */

import { normalizeMerchant } from "@/lib/recurring/detect";
import type { Millis } from "@/lib/money";
import type { RawTxn } from "@/lib/csv/autodetect";

export interface CategorySuggestion {
  key: string;
  name: string;
  emoji: string;
  color: string;          // hex, persisted to categories.color
  flex: "fixed" | "flexible" | "non_monthly";
  monthlyAvgMillis: Millis;
  suggestedLimitMillis: Millis;
  txnCount: number;
  sharePct: number;       // of total classified spend
}

/** Distinct, muted data colors — readable on white, distinguishable in charts. */
export const CATEGORY_PALETTE = [
  "#6B9BD1", // slate blue
  "#78B08A", // sage green
  "#E0A458", // ochre
  "#C97B84", // dusty rose
  "#8E7CC3", // heather purple
  "#5FB3B3", // muted teal
  "#D18B5F", // terracotta
  "#A3A83B", // olive
  "#C06BA6", // plum
  "#8A8A8A", // stone grey
] as const;

interface CategoryDef {
  key: string;
  name: string;
  emoji: string;
  flex: CategorySuggestion["flex"];
  patterns: RegExp;
}

/** Keyword classifier — ordered; first match wins. */
const CATEGORY_DEFS: CategoryDef[] = [
  {
    key: "housing",
    name: "Housing & utilities",
    emoji: "🏠",
    flex: "fixed",
    patterns:
      /rent|mortgage|strata|hydro|fortis|electric|water|utility|internet|telus|shaw|rogers|bell|insurance/,
  },
  {
    key: "groceries",
    name: "Groceries",
    emoji: "🛒",
    flex: "flexible",
    patterns:
      /grocer|save.?on|save foods|superstore|safeway|costco|walmart|no frills|whole foods|t ?t supermarket|loblaws|iga|market/,
  },
  {
    key: "dining",
    name: "Dining out",
    emoji: "🍜",
    flex: "flexible",
    patterns:
      /restaurant|cafe|coffee|starbucks|tim hortons|mcdonald|pizza|sushi|ramen|doordash|uber ?eats|skip ?the|bistro|bakery|pub|bar /,
  },
  {
    key: "transport",
    name: "Transport",
    emoji: "🚌",
    flex: "flexible",
    patterns:
      /translink|compass|transit|uber(?! ?eats)|lyft|taxi|gas|petro|shell|esso|chevron|parking|evo|modo|car2go/,
  },
  {
    key: "subscriptions",
    name: "Subscriptions",
    emoji: "📺",
    flex: "fixed",
    patterns:
      /netflix|spotify|disney|crave|prime|youtube|icloud|apple\.?com|google (one|storage)|patreon|substack|membership|gym|fitness/,
  },
  {
    key: "shopping",
    name: "Shopping",
    emoji: "🛍️",
    flex: "flexible",
    patterns:
      /amazon|amzn|shoppers|london drugs|canadian tire|ikea|best buy|uniqlo|zara|winners|indigo|etsy|shop/,
  },
  {
    key: "health",
    name: "Health",
    emoji: "🩺",
    flex: "non_monthly",
    patterns: /pharma|dental|clinic|physio|massage|optical|doctor|medical|rexall/,
  },
  {
    key: "entertainment",
    name: "Entertainment",
    emoji: "🎟️",
    flex: "flexible",
    patterns: /cinema|cineplex|movie|theatre|concert|ticketmaster|steam|nintendo|playstation|xbox|game/,
  },
  {
    key: "travel",
    name: "Travel",
    emoji: "✈️",
    flex: "non_monthly",
    patterns: /air ?canada|westjet|flair|airbnb|hotel|expedia|booking\.?com|hostel|vrbo|airline|flight/,
  },
];

const OTHER: Omit<CategoryDef, "patterns"> = {
  key: "other",
  name: "Everything else",
  emoji: "🧺",
  flex: "flexible",
};

export function classify(description: string): { key: string; def: Omit<CategoryDef, "patterns"> } {
  const normalized = ` ${normalizeMerchant(description)} ${description.toLowerCase()} `;
  for (const def of CATEGORY_DEFS) {
    if (def.patterns.test(normalized)) return { key: def.key, def };
  }
  return { key: OTHER.key, def: OTHER };
}

/** Round a monthly average UP to a friendly limit with ~10% headroom. */
export function suggestLimit(avgMillis: Millis): Millis {
  if (avgMillis <= 0) return 0;
  const withHeadroom = avgMillis * 1.1;
  const step = withHeadroom >= 100_000 ? 25_000 : 5_000; // $25 or $5 steps
  return Math.ceil(withHeadroom / step) * step;
}

export function analyzeTransactions(rows: RawTxn[]): {
  suggestions: CategorySuggestion[];
  monthsObserved: number;
  totalSpendMillis: Millis;
  expenseCount: number;
} {
  const expenses = rows.filter((r) => r.amountMillis < 0);
  const monthsObserved = Math.max(
    1,
    new Set(expenses.map((r) => r.txnDate.slice(0, 7))).size
  );

  const buckets = new Map<
    string,
    { def: Omit<CategoryDef, "patterns">; totalMillis: Millis; count: number }
  >();

  for (const txn of expenses) {
    const { key, def } = classify(txn.description);
    const bucket = buckets.get(key) ?? { def, totalMillis: 0, count: 0 };
    bucket.totalMillis += Math.abs(txn.amountMillis);
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const totalSpendMillis = [...buckets.values()].reduce(
    (a, b) => a + b.totalMillis,
    0
  );

  const suggestions = [...buckets.entries()]
    .map(([key, b]) => {
      const monthlyAvgMillis = Math.round(b.totalMillis / monthsObserved);
      return {
        key,
        name: b.def.name,
        emoji: b.def.emoji,
        flex: b.def.flex,
        color: "", // assigned below by spend rank for stable, distinct colors
        monthlyAvgMillis,
        suggestedLimitMillis: suggestLimit(monthlyAvgMillis),
        txnCount: b.count,
        sharePct:
          totalSpendMillis > 0 ? (b.totalMillis / totalSpendMillis) * 100 : 0,
      };
    })
    .sort((a, b) => b.monthlyAvgMillis - a.monthlyAvgMillis)
    .map((s, i) => ({
      ...s,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }));

  return { suggestions, monthsObserved, totalSpendMillis, expenseCount: expenses.length };
}
