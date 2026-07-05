"use client";

/**
 * settings-editor.tsx — thin client wrapper: the shared BudgetEditor
 * bound to the save action, with a refresh after saving so the server
 * component re-reads the persisted rows.
 */

import { useRouter } from "next/navigation";
import { BudgetEditor, type EditorRow } from "@/components/budget-editor";
import { saveBudgetConfig, type BudgetConfigItem } from "@/app/onboarding/actions";

export type SettingsRow = EditorRow;

export function SettingsEditor({ initialRows }: { initialRows: SettingsRow[] }) {
  const router = useRouter();

  const handleSave = async (items: BudgetConfigItem[], removed: string[]) => {
    const result = await saveBudgetConfig(items, removed);
    if (result.ok) {
      setTimeout(() => router.refresh(), 900);
    }
    return result;
  };

  return (
    <BudgetEditor
      initialRows={initialRows}
      submitLabel="Save changes 💾"
      onSave={handleSave}
    />
  );
}
