/**
 * /settings/budgets — revisit and modify categories, colors, and limits.
 * Loads the saved configuration (RLS-scoped) and reuses the exact editor
 * from onboarding, so both surfaces behave identically. Changes apply to
 * the current cycle immediately and to every future cycle automatically.
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SettingsEditor, type SettingsRow } from "./settings-editor";

export default async function BudgetSettingsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("budgets")
    .select("id, amount, category:categories(id, name, icon, color, flex)")
    .order("amount", { ascending: false });

  type JoinedCategory = {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    flex: string | null;
  };

  const rows: SettingsRow[] = (error ? [] : (data ?? [])).flatMap((b): SettingsRow[] => {
    const raw = b.category as JoinedCategory | JoinedCategory[] | null;
    const cat = Array.isArray(raw) ? raw[0] : raw;
    if (!cat) return [];
    return [
      {
        rowId: cat.id,
        categoryId: cat.id,
        name: cat.name,
        emoji: cat.icon ?? "🏷️",
        color: cat.color ?? "#8a8a8a",
        flex: (cat.flex ?? "flexible") as SettingsRow["flex"],
        limitDollars: Number(b.amount),
      },
    ];
  });

  return (
    <main className="px-6 py-10 lg:px-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-ink-faint">Settings</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Categories & budgets 🧰
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          This is your budget template — edits apply to the current cycle right
          away and roll into every future month automatically.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="tile flex flex-col items-start gap-3 p-8">
          <span className="text-3xl" aria-hidden>
            🌱
          </span>
          <p className="font-display text-lg font-semibold">Nothing here yet</p>
          <p className="text-sm text-ink-soft">
            Your budget hasn't been set up — a quick trip through onboarding
            builds one from your bank history.
          </p>
          <Link
            href="/onboarding"
            className="mt-2 rounded-full bg-trace px-5 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Set up my budget ✨
          </Link>
        </div>
      ) : (
        <div className="max-w-3xl">
          <SettingsEditor initialRows={rows} />
        </div>
      )}
    </main>
  );
}
