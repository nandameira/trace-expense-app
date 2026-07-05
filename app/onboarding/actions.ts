"use server";

/**
 * actions.ts — persist the budget configuration.
 *
 * Shared by onboarding ("Save & Confirm") and /settings/budgets. Every
 * write goes through the cookie-bound server client, so RLS scopes it to
 * the signed-in user; the user id is taken from the verified session,
 * never from the payload.
 *
 * Rollover model: budgets are per-user templates. Each time a paycheck
 * opens a new financial cycle, open_budget_periods() (migration 002)
 * seeds that cycle from these rows — so the configuration saved here
 * automatically applies to every subsequent month.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface BudgetConfigItem {
  categoryId?: string | null; // present when editing an existing category
  name: string;
  emoji: string;
  color: string;              // #rrggbb
  flex: "fixed" | "flexible" | "non_monthly";
  limitDollars: number;       // UI works in dollars; DB stores NUMERIC(14,3)
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const FLEX = new Set(["fixed", "flexible", "non_monthly"]);

function validate(items: BudgetConfigItem[]): string | null {
  if (!Array.isArray(items) || items.length === 0) return "Add at least one category 🪴";
  if (items.length > 30) return "That's a lot of categories — keep it to 30 or fewer.";
  const names = new Set<string>();
  for (const it of items) {
    const name = (it.name ?? "").trim();
    if (name.length < 1 || name.length > 40) return "Category names need 1–40 characters.";
    if (names.has(name.toLowerCase())) return `"${name}" appears twice — names must be unique.`;
    names.add(name.toLowerCase());
    if (!HEX.test(it.color)) return `"${name}" needs a valid color.`;
    if (!FLEX.has(it.flex)) return `"${name}" has an invalid group.`;
    if ((it.emoji ?? "").length > 8) return `"${name}"'s emoji is too long.`;
    if (
      typeof it.limitDollars !== "number" ||
      !Number.isFinite(it.limitDollars) ||
      it.limitDollars < 0 ||
      it.limitDollars > 1_000_000
    ) {
      return `"${name}" needs a limit between $0 and $1,000,000.`;
    }
  }
  return null;
}

export async function saveBudgetConfig(
  items: BudgetConfigItem[],
  removeCategoryIds: string[] = []
): Promise<SaveResult> {
  const invalid = validate(items);
  if (invalid) return { ok: false, error: invalid };
  if (removeCategoryIds.length > 30) return { ok: false, error: "Too many removals." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired — sign in again." };

  // 1. Removals first (cascade deletes the budget row; transactions keep
  //    their history with category_id set null).
  if (removeCategoryIds.length > 0) {
    const { error } = await supabase
      .from("categories")
      .delete()
      .in("id", removeCategoryIds); // RLS restricts to own rows
    if (error) return { ok: false, error: "Couldn't remove categories. Try again." };
  }

  // 2. Upsert categories, then budgets keyed to them.
  for (const item of items) {
    const categoryPayload = {
      user_id: user.id,
      name: item.name.trim(),
      icon: item.emoji || null,
      color: item.color.toLowerCase(),
      flex: item.flex,
    };

    let categoryId = item.categoryId ?? null;

    if (categoryId) {
      const { error } = await supabase
        .from("categories")
        .update(categoryPayload)
        .eq("id", categoryId);
      if (error) return { ok: false, error: `Couldn't update "${item.name}".` };
    } else {
      const { data, error } = await supabase
        .from("categories")
        .upsert(categoryPayload, { onConflict: "user_id,name" })
        .select("id")
        .single();
      if (error || !data) return { ok: false, error: `Couldn't save "${item.name}".` };
      categoryId = data.id;
    }

    const { error: budgetError } = await supabase.from("budgets").upsert(
      {
        user_id: user.id,
        category_id: categoryId,
        amount: item.limitDollars.toFixed(3), // NUMERIC(14,3)
        rollover: true, // template rolls into every new cycle
      },
      { onConflict: "user_id,category_id" }
    );
    if (budgetError) return { ok: false, error: `Couldn't save the limit for "${item.name}".` };
  }

  // 3. Seed the currently-open cycle so the budget takes effect today,
  //    not just at the next paycheck. Best-effort: no open cycle is fine.
  const { data: openMonth } = await supabase
    .from("financial_months")
    .select("id")
    .is("closed_on", null)
    .maybeSingle();
  if (openMonth) {
    await supabase.rpc("open_budget_periods", { p_month_id: openMonth.id });
  }

  revalidatePath("/budget");
  revalidatePath("/settings/budgets");
  revalidatePath("/dashboard");
  return { ok: true };
}
