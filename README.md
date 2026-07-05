# Trace Expense

Self-hosted personal finance, traced to the cent. Next.js (App Router) · Tailwind CSS v4 · Recharts · Supabase (Postgres + Google OAuth).

## Where each feature lives

| PRD feature | Implementation |
|---|---|
| Dynamic paycheck months | `supabase/schema.sql` → `financial_months`, `register_paycheck()` (returns `'anomaly'` to trigger the Raise/Bonus prompt), `resolve_paycheck_anomaly()` |
| Raise vs. Bonus intercept | `paycheck_baselines` table (raise = new row, bonus never touches it) + `checkPaycheck()` in `lib/csv/ingest.ts` for client-side detection |
| Smart CSV mapping | `csv_mappings.column_map` (JSONB, saved once per bank) + `ColumnMap` in `lib/csv/ingest.ts` |
| Auto-merge duplicates | Unique index on `transactions.dedup_hash` (md5 of user + exact date + exact amount, trigger-maintained); near matches insert as `needs_review` |
| Multi-currency fallback | `lib/fx.ts` (pluggable historical-rate provider, cached) → converted rows get `fx_estimated = true` and a ⚠ FX chip in the UI |
| Split dropdown (5–75%, default 50) | `SPLIT_OPTIONS` / `DEFAULT_SPLIT` in `lib/ledger/fifo.ts`, check constraint on `splits.user_share_pct`, dropdown in `RecentTransactionsTile` |
| FIFO wire reimbursements | `apply_reimbursement()` in SQL (atomic, row-locked, with allocation audit trail) + a pure TS mirror in `lib/ledger/fifo.ts` for optimistic previews |
| 3-decimal precision | `NUMERIC(14,3)` everywhere in Postgres; the app moves amounts as integer **millis** (`lib/money.ts`), rounding to 2 dp only at render |
| Bento dashboard | `app/dashboard/page.tsx` + `components/dashboard/tiles.tsx` (hero spend w/ delta, 14-day velocity sparkline, shared-ledger tile, top 3 categories, advisor flags) |
| RLS isolation | Enabled on every table; owner policies keyed to `auth.uid()` |

## Setup

1. **Supabase** — create a project, enable the Google provider under Auth, then run `supabase/schema.sql` in the SQL editor (or `supabase db push`).
2. **Env** — `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
3. **Run** — `npm install && npm run dev`. The dashboard currently renders from `app/dashboard/data.ts`, a mock view-model shaped exactly like the Supabase queries noted inline — swap each block for its query when wiring up.
4. **Self-host** — `docker build -t trace-expense .` (set `output: "standalone"` in `next.config.ts`), or deploy to Vercel + Supabase Cloud.

## Verified behavior

The schema and engines were exercised against Postgres 16:

- A paycheck within ±2% of baseline opens a new financial month and closes the previous one.
- A $3,600 deposit against a $3,000 baseline returns `'anomaly'`; resolving as **raise** writes a new baseline effective that date, **bonus** leaves the baseline untouched — either way the month then opens.
- A $300 wire against $310.83 outstanding settles the oldest split in full, the next partially, and records both allocations; overpayment is kept as `unapplied` credit.
- Re-importing an identical date+amount row is silently merged (`on conflict (dedup_hash) do nothing`).
- Millis math: `0.1 + 0.2` stores as exactly `0.300`; `$12.345` renders as `$12.35`.

---

## v2 — Monarch-core features

New surfaces: **/budget** (category + flex styles with rollover chips and pace forecast), **/accounts** (net worth chart + account list), **/recurring** (detected subscriptions with confidence + 14-day bill calendar), **/goals** (progress, required monthly pace), plus dashboard tiles for net worth and upcoming bills, all behind a shared sidebar shell.

| Feature | Where |
|---|---|
| Accounts & net worth | supabase/002_monarch_features.sql (accounts, balance_snapshots, account_balances view) + lib/networth.ts |
| Budgets (category + flex, rollover) | budgets/budget_periods, open_budget_periods() (chains rollover cycle-to-cycle), sync_budget_spent() trigger + lib/budget/engine.ts |
| Recurring detection | lib/recurring/detect.ts (merchant normalization, cadence matching, amount-stability filter, next-date prediction) persisted to recurring_items |
| Auto-categorization rules | category_rules + lib/rules/categorize.ts, wired into ingestCsv() |
| Goals | goals/goal_contributions, goal_progress view + lib/goals.ts |

### v2 verification log
- Migration loads on top of schema.sql against Postgres 16; RLS on all 8 new tables.
- SQL: opening a second cycle rolled Groceries' $150 surplus in; the spent-sync trigger tracked a landed transaction; account_balances signs liabilities negative; goal_progress sums contributions.
- TS: 27/27 unit tests (recurring true/false positives incl. reference-code suffixes and grocery-store rejection, rollover math, over-budget states, flex aggregation, rule priority + amount bounds + invalid-regex safety, net-worth carry-forward and delta, goal pacing).
- next build compiles all routes with strict types; production server smoke test returned HTTP 200 on all five pages with engine-computed values rendered server-side.

---

## v3 — Onboarding, budget generation & restyle

New flow: first-time users are redirected to **/onboarding** (multi-file CSV upload → animated analysis → editable budget review → Save & Confirm), and **/settings/budgets** lets them revisit categories, colors, and limits any time. The saved configuration is a template: `open_budget_periods()` applies it to every new financial cycle automatically.

Key modules: `lib/csv/autodetect.ts` (zero-config column detection, debit/credit pairs, sign heuristics, multi-file merge with cross-file dedupe), `lib/budget/generate.ts` (keyword classifier, N-month averaging, limit suggestion with headroom, persistent 10-color data palette), `app/onboarding/actions.ts` (validated server action shared with settings), `components/budget-editor.tsx` (shared review/edit UI), `components/analyzing-overlay.tsx` ($ + magnifying-glass loading state).

Design system v3: Lora serif headings, Inter body with tabular numerals for all figures, strictly monochrome chrome, `#CEEC97` reserved for primary buttons/active states/focus, category colors as persisted data colors, friendly emoji in category names, empty states, loading and success messages 🪴

### v3 verification log
- 71 unit tests green across four suites (money/FIFO, engines, crypto, onboarding: autodetect layouts incl. debit/credit and positive-expense statements, cross-file dedupe, classifier incl. Uber-vs-UberEats, limit rounding, 6-month sparse-category averaging, distinct color assignment).
- Production build compiles all 13 routes; smoke tests: /onboarding and /settings/budgets protected (307 → gateway with `next` preserved), no redirect loops (max 1 hop), Lora + accent button served on the gateway.
