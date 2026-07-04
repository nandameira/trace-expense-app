-- ============================================================================
-- TRACE EXPENSE — Migration 002: Monarch-core features
--   Accounts & net worth · Budgets (category + flex, rollover) ·
--   Recurring detection · Auto-categorization rules · Goals
-- Run AFTER schema.sql. All currency = NUMERIC(14,3). RLS on everything.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ACCOUNTS & NET WORTH
-- ----------------------------------------------------------------------------
create type public.account_kind as enum
  ('chequing', 'savings', 'credit_card', 'investment', 'loan', 'property', 'other');

create table public.accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  kind         public.account_kind not null default 'chequing',
  institution  text,
  -- liabilities (credit_card, loan) count NEGATIVE toward net worth
  is_liability boolean not null default false,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (user_id, name)
);

-- Point-in-time balances. Bank-sync apps get these from aggregators;
-- self-hosted, they come from CSV closing balances or manual entry.
create table public.balance_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  as_of       date not null,
  balance     numeric(14,3) not null,
  created_at  timestamptz not null default now(),
  unique (account_id, as_of)
);

create index idx_snapshots_user_date on public.balance_snapshots (user_id, as_of);

-- Latest balance per account + signed net-worth contribution
create or replace view public.account_balances
with (security_invoker = true) as
select distinct on (a.id)
  a.id as account_id, a.user_id, a.name, a.kind, a.is_liability,
  s.balance,
  case when a.is_liability then -s.balance else s.balance end as net_worth_effect,
  s.as_of
from public.accounts a
join public.balance_snapshots s on s.account_id = a.id
where not a.archived
order by a.id, s.as_of desc;

-- Net worth time series (per snapshot date, carrying each account's latest
-- balance forward) is computed app-side in lib/networth.ts to keep SQL simple.

-- Link transactions to their source account (nullable for legacy rows)
alter table public.transactions
  add column account_id uuid references public.accounts (id) on delete set null;

-- ----------------------------------------------------------------------------
-- 2. BUDGETS — category budgeting with rollover, plus Monarch-style
--    flex groups (fixed / flexible / non_monthly)
-- ----------------------------------------------------------------------------
create type public.flex_group as enum ('fixed', 'flexible', 'non_monthly');

alter table public.categories
  add column flex public.flex_group not null default 'flexible';

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  -- per dynamic financial cycle (paycheck-to-paycheck), not calendar month
  amount      numeric(14,3) not null check (amount >= 0),
  rollover    boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, category_id)
);

-- Per-cycle materialized results; rollover chains cycle -> cycle
create table public.budget_periods (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  budget_id          uuid not null references public.budgets (id) on delete cascade,
  financial_month_id uuid not null references public.financial_months (id) on delete cascade,
  budgeted           numeric(14,3) not null,
  rolled_in          numeric(14,3) not null default 0,  -- surplus/deficit carried in
  spent              numeric(14,3) not null default 0,
  unique (budget_id, financial_month_id)
);

-- ----------------------------------------------------------------------------
-- 3. RECURRING ITEMS (subscriptions & bills)
--    Detection runs app-side (lib/recurring/detect.ts); confirmed items
--    persist here and power the upcoming-bills calendar + advisor alerts.
-- ----------------------------------------------------------------------------
create type public.cadence as enum ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');

create table public.recurring_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  merchant_key     text not null,            -- normalized merchant, e.g. 'netflix'
  display_name     text not null,
  category_id      uuid references public.categories (id) on delete set null,
  cadence          public.cadence not null,
  typical_amount   numeric(14,3) not null,
  last_seen        date not null,
  next_expected    date not null,
  status           text not null default 'active'
                   check (status in ('active', 'dismissed', 'cancelled')),
  detected_at      timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create index idx_recurring_upcoming
  on public.recurring_items (user_id, next_expected)
  where status = 'active';

-- ----------------------------------------------------------------------------
-- 4. AUTO-CATEGORIZATION RULES (applied during CSV ingest, priority order)
-- ----------------------------------------------------------------------------
create table public.category_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  category_id  uuid not null references public.categories (id) on delete cascade,
  -- match_kind: 'contains' (case-insensitive substring) | 'regex'
  match_kind   text not null default 'contains' check (match_kind in ('contains','regex')),
  pattern      text not null,
  min_amount   numeric(14,3),               -- optional absolute-amount bounds
  max_amount   numeric(14,3),
  priority     int  not null default 100,   -- lower wins
  created_at   timestamptz not null default now()
);

create index idx_rules_user_priority on public.category_rules (user_id, priority);

-- ----------------------------------------------------------------------------
-- 5. GOALS
-- ----------------------------------------------------------------------------
create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null,
  emoji        text,
  target       numeric(14,3) not null check (target > 0),
  target_date  date,
  account_id   uuid references public.accounts (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.goal_contributions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  goal_id         uuid not null references public.goals (id) on delete cascade,
  transaction_id  uuid references public.transactions (id) on delete set null,
  amount          numeric(14,3) not null check (amount <> 0),  -- negative = withdrawal
  contributed_on  date not null default current_date
);

create index idx_contrib_goal on public.goal_contributions (goal_id, contributed_on);

create or replace view public.goal_progress
with (security_invoker = true) as
select
  g.id as goal_id, g.user_id, g.name, g.emoji, g.target, g.target_date,
  coalesce(sum(c.amount), 0)::numeric(14,3) as saved,
  greatest(g.target - coalesce(sum(c.amount), 0), 0)::numeric(14,3) as remaining
from public.goals g
left join public.goal_contributions c on c.goal_id = g.id
group by g.id;

-- ----------------------------------------------------------------------------
-- 6. BUDGET PERIOD OPENER — called when register_paycheck opens a cycle.
--    Seeds each budget's period and carries rollover from the closed cycle.
-- ----------------------------------------------------------------------------
create or replace function public.open_budget_periods(p_month_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
  v_prev_id uuid;
  v_count   int := 0;
  b         record;
  v_roll    numeric(14,3);
begin
  select user_id into v_user_id
  from public.financial_months where id = p_month_id;

  if v_user_id is null or v_user_id <> auth.uid() then
    raise exception 'Financial month not found or not owned by caller';
  end if;

  -- previous (most recently closed) cycle
  select id into v_prev_id
  from public.financial_months
  where user_id = v_user_id and closed_on is not null
  order by closed_on desc limit 1;

  for b in select * from public.budgets where user_id = v_user_id loop
    v_roll := 0;
    if b.rollover and v_prev_id is not null then
      select coalesce(budgeted + rolled_in - spent, 0) into v_roll
      from public.budget_periods
      where budget_id = b.id and financial_month_id = v_prev_id;
      v_roll := coalesce(v_roll, 0);
    end if;

    insert into public.budget_periods
      (user_id, budget_id, financial_month_id, budgeted, rolled_in)
    values (v_user_id, b.id, p_month_id, b.amount, v_roll)
    on conflict (budget_id, financial_month_id) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- Keep budget_periods.spent in sync as transactions land
create or replace function public.sync_budget_spent()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  t := coalesce(new, old);
  if t.category_id is null or t.financial_month_id is null then
    return coalesce(new, old);
  end if;

  update public.budget_periods bp
  set spent = coalesce((
    select sum(abs(tx.amount_cad))
    from public.transactions tx
    where tx.category_id = t.category_id
      and tx.financial_month_id = t.financial_month_id
      and tx.kind = 'expense'
  ), 0)
  from public.budgets b
  where bp.budget_id = b.id
    and b.category_id = t.category_id
    and bp.financial_month_id = t.financial_month_id;

  return coalesce(new, old);
end $$;

create trigger trg_sync_budget_spent
  after insert or update of amount_cad, category_id, financial_month_id or delete
  on public.transactions
  for each row execute function public.sync_budget_spent();

-- ----------------------------------------------------------------------------
-- 7. RLS
-- ----------------------------------------------------------------------------
alter table public.accounts           enable row level security;
alter table public.balance_snapshots  enable row level security;
alter table public.budgets            enable row level security;
alter table public.budget_periods     enable row level security;
alter table public.recurring_items    enable row level security;
alter table public.category_rules     enable row level security;
alter table public.goals              enable row level security;
alter table public.goal_contributions enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'accounts','balance_snapshots','budgets','budget_periods',
    'recurring_items','category_rules','goals','goal_contributions'
  ] loop
    execute format(
      'create policy "owner all" on public.%I
         for all using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;
