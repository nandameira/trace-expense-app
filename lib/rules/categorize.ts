/**
 * categorize.ts — auto-categorization rules (Monarch-style).
 *
 * Rules run at CSV ingest, priority order (lower number wins first match).
 * `contains` = case-insensitive substring; `regex` = user-supplied pattern.
 * Optional min/max bounds apply to the transaction's absolute amount.
 */

import type { Millis } from "@/lib/money";

export interface CategoryRule {
  id: string;
  categoryId: string;
  matchKind: "contains" | "regex";
  pattern: string;
  minAmountMillis?: Millis | null;
  maxAmountMillis?: Millis | null;
  priority: number;
}

export function compileRules(rules: CategoryRule[]) {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const compiled = sorted.map((r) => ({
    rule: r,
    regex:
      r.matchKind === "regex"
        ? safeRegex(r.pattern)
        : null,
    needle: r.matchKind === "contains" ? r.pattern.toLowerCase() : null,
  }));

  return function categorize(
    description: string,
    amountMillis: Millis
  ): { categoryId: string; ruleId: string } | null {
    const desc = description.toLowerCase();
    const magnitude = Math.abs(amountMillis);

    for (const { rule, regex, needle } of compiled) {
      if (rule.minAmountMillis != null && magnitude < rule.minAmountMillis) continue;
      if (rule.maxAmountMillis != null && magnitude > rule.maxAmountMillis) continue;

      const hit =
        needle !== null ? desc.includes(needle) : regex !== null && regex.test(description);
      if (hit) return { categoryId: rule.categoryId, ruleId: rule.id };
    }
    return null;
  };
}

/** Never let a bad user pattern crash ingest. */
function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}
