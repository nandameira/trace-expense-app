"use client";

/**
 * flow.tsx — the onboarding state machine.
 *
 *   upload ──▶ analyzing ──▶ review ──▶ done (→ /dashboard)
 *
 * Upload accepts MULTIPLE CSVs at once (drag-drop or picker); files are
 * parsed with the zero-config autodetector and merged with cross-file
 * dedupe. The analyzing stage shows the $-and-magnifying-glass overlay
 * for a minimum beat even though the math itself is instant. Review
 * hands the suggestions to the shared BudgetEditor; saving calls the
 * server action and lands on the dashboard.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  parseOneCsv,
  mergeFiles,
  monthsCovered,
  type FileParseResult,
} from "@/lib/csv/autodetect";
import { analyzeTransactions } from "@/lib/budget/generate";
import { AnalyzingOverlay } from "@/components/analyzing-overlay";
import { BudgetEditor, type EditorRow } from "@/components/budget-editor";
import { saveBudgetConfig } from "./actions";

const MIN_ANALYZE_MS = 2600; // let the animation land
const RECOMMENDED_MONTHS = 6;

type Stage = "upload" | "analyzing" | "review";

export function OnboardingFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [monthsSeen, setMonthsSeen] = useState(0);
  const [stats, setStats] = useState({ txns: 0, duplicates: 0 });
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const csvs = [...incoming].filter(
      (f) => f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv"
    );
    if (csvs.length === 0) {
      setUploadError("Those don't look like CSV files — export CSVs from your bank 🏦");
      return;
    }
    setUploadError(null);
    setFiles((existing) => {
      const names = new Set(existing.map((f) => f.name + f.size));
      return [...existing, ...csvs.filter((f) => !names.has(f.name + f.size))];
    });
  };

  const analyze = async () => {
    if (files.length === 0) {
      setUploadError("Add at least one CSV to analyze 📄");
      return;
    }
    setStage("analyzing");
    const startedAt = Date.now();

    // Parse every file (Phase 6: batch processing, combined stream)
    const results: FileParseResult[] = await Promise.all(
      files.map(async (f) => parseOneCsv(f.name, await f.text()))
    );
    const errors = results
      .filter((r) => r.error)
      .map((r) => `${r.fileName}: ${r.error}`);
    const merged = mergeFiles(results);

    if (merged.rows.length === 0) {
      setFileErrors(errors);
      setUploadError(
        "No transactions could be read from those files 😔 Check they're bank CSV exports and try again."
      );
      setStage("upload");
      return;
    }

    const analysis = analyzeTransactions(merged.rows);
    const editorRows: EditorRow[] = analysis.suggestions.map((s) => ({
      rowId: s.key,
      categoryId: null,
      name: s.name,
      emoji: s.emoji,
      color: s.color,
      flex: s.flex,
      limitDollars: Math.round(s.suggestedLimitMillis / 10) / 100,
      monthlyAvgDollars: Math.round(s.monthlyAvgMillis / 10) / 100,
    }));

    setFileErrors(errors);
    setMonthsSeen(analysis.monthsObserved);
    setStats({ txns: analysis.expenseCount, duplicates: merged.duplicatesDropped });
    setRows(editorRows);

    // Keep the overlay up for its minimum beat
    const elapsed = Date.now() - startedAt;
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_ANALYZE_MS - elapsed)));
    setStage("review");
  };

  const handleSave = async (
    items: Parameters<typeof saveBudgetConfig>[0],
    removed: string[]
  ) => {
    const result = await saveBudgetConfig(items, removed);
    if (result.ok) {
      setTimeout(() => router.push("/dashboard"), 900); // let "Saved! ✨" land
    }
    return result;
  };

  if (stage === "analyzing") return <AnalyzingOverlay />;

  if (stage === "review") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8">
          <p className="text-sm font-medium text-ink-faint">Step 2 of 2</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Here's your budget, sketched from real life 🎨
          </h1>
          <p className="num mt-2 text-sm text-ink-soft">
            {stats.txns.toLocaleString()} expenses across {monthsSeen}{" "}
            {monthsSeen === 1 ? "month" : "months"}
            {stats.duplicates > 0 && ` (${stats.duplicates} duplicates skipped)`}.
            Rename anything, pick new colors, nudge the limits — then make it
            official.
          </p>
          {monthsSeen < RECOMMENDED_MONTHS && (
            <p className="mt-3 rounded-xl bg-amber-soft px-4 py-3 text-sm font-medium text-amber">
              Heads up: only {monthsSeen} {monthsSeen === 1 ? "month" : "months"} of
              history found — averages get better with {RECOMMENDED_MONTHS}+ months 🗓️
            </p>
          )}
        </header>
        <BudgetEditor
          initialRows={rows}
          submitLabel="Save & Confirm 🎉"
          onSave={handleSave}
        />
      </main>
    );
  }

  // stage === "upload"
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12">
      <p className="text-sm font-medium text-ink-faint">Step 1 of 2</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Welcome! Let's build your budget 🪴
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Upload bank CSV exports covering at least{" "}
        <strong className="font-semibold text-ink">6 months</strong> of spending —
        one big file or several monthly ones, we'll stitch them together. Nothing
        leaves your browser until you confirm the budget.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`tile mt-6 flex flex-col items-center gap-3 border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-ink bg-trace-soft" : "border-line"
        }`}
      >
        <span className="text-3xl" aria-hidden>
          📁
        </span>
        <p className="text-sm font-medium">
          Drag your CSV files here, or{" "}
          <button
            onClick={() => inputRef.current?.click()}
            className="font-semibold underline decoration-2 underline-offset-2 focus-visible:outline-2 focus-visible:outline-trace"
          >
            browse
          </button>
        </p>
        <p className="text-xs text-ink-faint">
          Multiple files welcome — e.g. six monthly statements at once ✨
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="sr-only"
          aria-label="Upload CSV files"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {files.map((f) => (
            <li
              key={f.name + f.size}
              className="num flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-medium"
            >
              📄 {f.name}
              <button
                aria-label={`Remove ${f.name}`}
                onClick={() =>
                  setFiles((fs) => fs.filter((x) => x.name + x.size !== f.name + f.size))
                }
                className="text-ink-faint hover:text-negative focus-visible:outline-2 focus-visible:outline-trace"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {uploadError && (
        <p role="alert" className="mt-4 rounded-xl bg-negative-soft px-4 py-3 text-sm font-medium text-negative">
          {uploadError}
        </p>
      )}
      {fileErrors.map((e) => (
        <p key={e} className="mt-2 text-xs text-amber">
          ⚠️ {e}
        </p>
      ))}

      <button
        onClick={analyze}
        disabled={files.length === 0}
        className="mt-6 self-start rounded-full bg-trace px-6 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-85 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Analyze my spending 🔍
      </button>
    </main>
  );
}
