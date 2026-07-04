import { budgetPeriods, cycle } from "../demo";
import { BudgetView } from "@/components/budget/budget-view";

export default function BudgetPage() {
  return (
    <main className="px-6 py-10 lg:px-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-ink-faint">Budget</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {cycle.label}
        </h1>
      </header>
      <BudgetView periods={budgetPeriods} cycle={cycle} />
    </main>
  );
}
