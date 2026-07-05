"use client";

/**
 * budget-editor.tsx — the interactive category/limit editor.
 *
 * One component, two homes: the onboarding review step and
 * /settings/budgets. Rows support rename, emoji, color reassignment
 * (from the persistent data palette), limit edits, removal, and adding
 * fresh categories. The parent supplies the save handler.
 */

import { useMemo, useState } from "react";
import { CATEGORY_PALETTE } from "@/lib/budget/generate";
import type { BudgetConfigItem } from "@/app/onboarding/actions";

export interface EditorRow extends BudgetConfigItem {
  rowId: string;              // stable client key
  monthlyAvgDollars?: number; // shown as the "based on history" reference
}

const FLEX_LABELS = {
  fixed: "Fixed",
  flexible: "Flexible",
  non_monthly: "Non-monthly",
} as const;

export function BudgetEditor({
  initialRows,
  submitLabel,
  onSave,
}: {
  initialRows: EditorRow[];
  submitLabel: string;
  onSave: (
    items: BudgetConfigItem[],
    removedCategoryIds: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [rows, setRows] = useState<EditorRow[]>(initialRows);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const totalLimit = useMemo(
    () => rows.reduce((a, r) => a + (Number.isFinite(r.limitDollars) ? r.limitDollars : 0), 0),
    [rows]
  );

  const update = (rowId: string, patch: Partial<EditorRow>) =>
    setRows((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const remove = (row: EditorRow) => {
    setRows((rs) => rs.filter((r) => r.rowId !== row.rowId));
    if (row.categoryId) setRemovedIds((ids) => [...ids, row.categoryId!]);
  };

  const addRow = () =>
    setRows((rs) => [
      ...rs,
      {
        rowId: `new-${Date.now()}`,
        categoryId: null,
        name: "",
        emoji: "🌱",
        color: CATEGORY_PALETTE[rs.length % CATEGORY_PALETTE.length],
        flex: "flexible",
        limitDollars: 0,
      },
    ]);

  const submit = async () => {
    setStatus("saving");
    setError(null);
    const items: BudgetConfigItem[] = rows.map(
      ({ rowId: _rowId, monthlyAvgDollars: _avg, ...item }) => item
    );
    const result = await onSave(items, removedIds);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong — nothing was saved.");
      setStatus("idle");
      return;
    }
    setStatus("saved");
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.rowId} className="tile flex flex-wrap items-center gap-3 p-4">
            {/* emoji */}
            <input
              aria-label={`Emoji for ${row.name || "new category"}`}
              value={row.emoji}
              onChange={(e) => update(row.rowId, { emoji: e.target.value })}
              className="w-12 input rounded-lg border border-line bg-card px-2 py-2 text-center text-lg focus-visible:outline-2 focus-visible:outline-ink"
            />
            {/* name */}
            <input
              aria-label="Category name"
              value={row.name}
              placeholder="Category name"
              maxLength={40}
              onChange={(e) => update(row.rowId, { name: e.target.value })}
              className="min-w-36 flex-1 input rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ink"
            />

            {/* color palette */}
            <div
              role="radiogroup"
              aria-label={`Color for ${row.name || "new category"}`}
              className="flex items-center gap-1.5"
            >
              {CATEGORY_PALETTE.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={row.color === c}
                  aria-label={`Color ${c}`}
                  onClick={() => update(row.rowId, { color: c })}
                  className="h-5 w-5 rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  style={{
                    background: c,
                    transform: row.color === c ? "scale(1.25)" : undefined,
                    boxShadow: row.color === c ? "0 0 0 2px var(--color-ink)" : undefined,
                  }}
                />
              ))}
            </div>

            {/* flex group */}
            <select
              aria-label="Budget group"
              value={row.flex}
              onChange={(e) =>
                update(row.rowId, { flex: e.target.value as EditorRow["flex"] })
              }
              className="input rounded-lg border border-line bg-card px-2 py-2 text-xs font-medium text-ink-soft focus-visible:outline-2 focus-visible:outline-ink"
            >
              {Object.entries(FLEX_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>

            {/* limit */}
            <label className="num flex items-center gap-1 text-sm font-semibold">
              <span className="text-ink-faint">$</span>
              <input
                aria-label={`Monthly limit for ${row.name || "new category"}`}
                type="number"
                min={0}
                step={5}
                value={Number.isFinite(row.limitDollars) ? row.limitDollars : ""}
                onChange={(e) =>
                  update(row.rowId, { limitDollars: e.target.valueAsNumber })
                }
                className="num w-24 input rounded-lg border border-line bg-card px-2 py-2 text-right text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ink"
              />
              <span className="text-xs font-medium text-ink-faint">/mo</span>
            </label>

            {row.monthlyAvgDollars != null && (
              <span className="num w-full text-xs text-ink-faint sm:w-auto">
                avg ${row.monthlyAvgDollars.toFixed(2)}/mo from your history
              </span>
            )}

            <button
              onClick={() => remove(row)}
              aria-label={`Remove ${row.name || "category"}`}
              className="ml-auto rounded-full px-2 py-1 text-xs font-semibold text-ink-faint transition-colors hover:text-negative focus-visible:outline-2 focus-visible:outline-ink"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <button
        onClick={addRow}
        className="btn-secondary self-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        + Add a category
      </button>

      {error && (
        <p role="alert" className="rounded-xl bg-negative-soft px-4 py-3 text-sm font-medium text-negative">
          {error}
        </p>
      )}

      <div className="tile flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="num text-sm font-semibold">
          Total monthly budget: ${totalLimit.toLocaleString("en-CA", { minimumFractionDigits: 2 })}
        </p>
        {status === "saved" ? (
          <p className="rounded-full bg-trace px-4 py-2 text-sm font-semibold text-ink">
            Saved — your budget now applies to every month
          </p>
        ) : (
          <button
            onClick={submit}
            disabled={status === "saving" || rows.length === 0}
            className="btn-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {status === "saving" ? "Saving…" : submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}
