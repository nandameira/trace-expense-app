-- ============================================================================
-- TRACE EXPENSE — Supabase PostgreSQL Schema
-- ----------------------------------------------------------------------------
-- Design notes:
--   * All currency columns are NUMERIC(14,3) — 3 decimal places of storage
--     precision (per spec), rounded to 2 dp only at the UI layer.
--   * Financial "months" are dynamic: a new month opens when a paycheck
--     transaction lands. See financial_months + paycheck_baselines.
--   * Splits feed a shared ledger. Reimbursements settle splits FIFO via
--     apply_reimbursement(), with a full allocation audit trail.
--   * Every table is protected by Row Level Security keyed to auth.uid().
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILES (mirrors auth.users; Google OAuth handled by Supabase Auth)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  partner_label text not null default 'Partner',  -- name shown on shared ledger
  base_currency char(3) not null default 'CAD',
  created_at    timestamptz not null default now()
);

-- Auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES
-- ----------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  icon       text,                       -- lucide icon name for the UI
  color      text,                       -- hex token for chips / charts
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ----------------------------------------------------------------------------
-- 3. PAYCHECK BASELINES  (expected salary; raises create a new row,
--    bonuses never touch this table)
-- ----------------------------------------------------------------------------
create table public.paycheck_baselines (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  expected_amount numeric(14,3) not null check (expected_amount > 0),
  effective_from  date not null default current_date,
  created_at      timestamptz not null default now()
);

create index idx_baselines_user_effective
  on public.paycheck_baselines (user_id, effective_from desc);

-- ----------------------------------------------------------------------------
-- 4. FINANCIAL MONTHS (dynamic boundaries — opened by a paycheck)
-- ----------------------------------------------------------------------------
create table public.financial_months (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  opened_on              date not null,           -- date the paycheck landed
  closed_on              date,                    -- null = current open month
  opening_paycheck_id    uuid,                    -- FK added after transactions
  label                  text not null,           -- e.g. "Jun 27 – Jul 24"
  created_at             timestamptz not null default now(),
  unique (user_id, opened_on)
);

create index idx_fmonths_user_open
  on public.financial_months (user_id, opened_on desc);

-- ----------------------------------------------------------------------------
-- 5. CSV MAPPINGS & IMPORTS
-- ----------------------------------------------------------------------------
create table public.csv_mappings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  bank_label  text not null,             -- "RBC Chequing", "Amex", ...
  -- Column map, e.g. {"date":"Transaction Date","description":"Details",
  --                   "amount":"CAD$","type":"Debit/Credit",
  --                   "foreign_amount":"USD$","foreign_currency":"Currency"}
  column_map  jsonb not null,
  date_format text not null default 'YYYY-MM-DD',
  created_at  timestamptz not null default now(),
  unique (user_id, bank_label)
);

create table public.csv_imports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  mapping_id     uuid references public.csv_mappings (id) on delete set null,
  filename       text not null,
  rows_total     int  not null default 0,
  rows_inserted  int  not null default 0,
  rows_merged    int  not null default 0,   -- exact duplicates silently skipped
  rows_flagged   int  not null default 0,   -- near-matches awaiting review
  imported_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. TRANSACTIONS (the ledger)
-- ----------------------------------------------------------------------------
create type public.txn_kind as enum
  ('expense', 'income', 'paycheck', 'reimbursement', 'transfer');

create type public.txn_status as enum
  ('confirmed', 'needs_review');           -- near-duplicate CSV rows land here

create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  financial_month_id uuid references public.financial_months (id) on delete set null,
  import_id          uuid references public.csv_imports (id) on delete set null,
  category_id        uuid references public.categories (id) on delete set null,

  txn_date           date not null,
  description        text not null,
  kind               public.txn_kind   not null default 'expense',
  status             public.txn_status not null default 'confirmed',

  -- Settled CAD value. NUMERIC(14,3): 3 dp stored, 2 dp rendered.
  amount_cad         numeric(14,3) not null,

  -- Multi-currency provenance
  foreign_amount     numeric(14,3),
  foreign_currency   char(3),
  fx_rate            numeric(14,6),
  fx_estimated       boolean not null default false,  -- ⚠ rate fetched, not settled

  -- Exact-duplicate merge key: md5(user_id || txn_date || amount_cad),
  -- maintained by trigger (date::text casts aren't IMMUTABLE, so a
  -- generated column is not allowed here).
  dedup_hash         text not null,

  created_at         timestamptz not null default now()
);

create or replace function public.set_txn_dedup_hash()
returns trigger language plpgsql as $$
begin
  new.dedup_hash := md5(
    new.user_id::text || to_char(new.txn_date, 'YYYY-MM-DD') || new.amount_cad::text
  );
  return new;
end $$;

create trigger trg_txn_dedup_hash
  before insert or update of user_id, txn_date, amount_cad on public.transactions
  for each row execute function public.set_txn_dedup_hash();

-- Exact Date + Exact Amount duplicates are auto-merged (ignored) on insert
create unique index uq_txn_dedup on public.transactions (dedup_hash);

create index idx_txn_user_date  on public.transactions (user_id, txn_date desc);
create index idx_txn_user_month on public.transactions (user_id, financial_month_id);

alter table public.financial_months
  add constraint fk_opening_paycheck
  foreign key (opening_paycheck_id) references public.transactions (id)
  on delete set null;

-- ----------------------------------------------------------------------------
-- 7. SPLITS (shared ledger). One row per split transaction.
--    user_share_pct is what stays YOUR expense; the remainder is the
--    partner's debt on the shared ledger.
-- ----------------------------------------------------------------------------
create table public.splits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  transaction_id  uuid not null unique references public.transactions (id) on delete cascade,

  user_share_pct  numeric(5,2) not null default 50.00
                  check (user_share_pct in (5,10,15,20,25,50,75)),

  partner_amount  numeric(14,3) not null check (partner_amount >= 0),
  settled_amount  numeric(14,3) not null default 0
                  check (settled_amount >= 0 and settled_amount <= partner_amount),

  -- FIFO ordering key = the underlying expense date (ties broken by creation)
  fifo_date       date not null,
  created_at      timestamptz not null default now()
);

create index idx_splits_fifo
  on public.splits (user_id, fifo_date asc, created_at asc)
  where settled_amount < partner_amount;

-- Outstanding shared-ledger balance, one call from the dashboard tile
create or replace view public.shared_ledger_balance
with (security_invoker = true) as
select
  user_id,
  sum(partner_amount - settled_amount)::numeric(14,3) as outstanding,
  count(*) filter (where settled_amount < partner_amount) as open_items
from public.splits
group by user_id;

-- ----------------------------------------------------------------------------
-- 8. REIMBURSEMENTS + FIFO allocation audit trail
-- ----------------------------------------------------------------------------
create table public.reimbursements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  transaction_id  uuid not null unique references public.transactions (id) on delete cascade,
  amount          numeric(14,3) not null check (amount > 0),
  unapplied       numeric(14,3) not null default 0,   -- credit left after FIFO pass
  applied_at      timestamptz not null default now()
);

create table public.reimbursement_allocations (
  id                uuid primary key default gen_random_uuid(),
  reimbursement_id  uuid not null references public.reimbursements (id) on delete cascade,
  split_id          uuid not null references public.splits (id) on delete cascade,
  amount            numeric(14,3) not null check (amount > 0),
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. FIFO ENGINE — apply an incoming wire against the oldest open splits
-- ----------------------------------------------------------------------------
create or replace function public.apply_reimbursement(
  p_transaction_id uuid,        -- the incoming wire/deposit transaction
  p_amount         numeric(14,3)
) returns uuid                  -- reimbursement id
language plpgsql security definer set search_path = public as $$
declare
  v_user_id   uuid;
  v_reimb_id  uuid;
  v_remaining numeric(14,3) := p_amount;
  v_apply     numeric(14,3);
  r           record;
begin
  select user_id into v_user_id
  from public.transactions where id = p_transaction_id;

  if v_user_id is null or v_user_id <> auth.uid() then
    raise exception 'Transaction not found or not owned by caller';
  end if;

  insert into public.reimbursements (user_id, transaction_id, amount)
  values (v_user_id, p_transaction_id, p_amount)
  returning id into v_reimb_id;

  -- Oldest expense first; lock rows so concurrent wires can't double-settle
  for r in
    select id, (partner_amount - settled_amount) as outstanding
    from public.splits
    where user_id = v_user_id
      and settled_amount < partner_amount
    order by fifo_date asc, created_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_apply := least(v_remaining, r.outstanding);

    update public.splits
      set settled_amount = settled_amount + v_apply
      where id = r.id;

    insert into public.reimbursement_allocations (reimbursement_id, split_id, amount)
    values (v_reimb_id, r.id, v_apply);

    v_remaining := v_remaining - v_apply;
  end loop;

  -- Anything left over is stored as unapplied credit (partner overpaid)
  update public.reimbursements
    set unapplied = v_remaining where id = v_reimb_id;

  return v_reimb_id;
end $$;

-- ----------------------------------------------------------------------------
-- 10. PAYCHECK / MONTH-BOUNDARY ENGINE
--     Call after inserting a paycheck txn. Returns 'opened' | 'anomaly'.
--     The UI shows the Raise-vs-Bonus prompt when 'anomaly' comes back.
-- ----------------------------------------------------------------------------
create or replace function public.register_paycheck(
  p_transaction_id uuid,
  p_tolerance_pct  numeric default 2.0    -- ±2% counts as "same salary"
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_txn       record;
  v_baseline  numeric(14,3);
  v_month_id  uuid;
begin
  select * into v_txn from public.transactions
  where id = p_transaction_id and user_id = auth.uid() and kind = 'paycheck';

  if v_txn is null then
    raise exception 'Paycheck transaction not found';
  end if;

  select expected_amount into v_baseline
  from public.paycheck_baselines
  where user_id = v_txn.user_id and effective_from <= v_txn.txn_date
  order by effective_from desc limit 1;

  -- Anomaly: amount deviates from baseline beyond tolerance → UI intercepts
  if v_baseline is not null
     and abs(v_txn.amount_cad - v_baseline) > (v_baseline * p_tolerance_pct / 100)
  then
    return 'anomaly';
  end if;

  -- Close the open month, open a new one
  update public.financial_months
    set closed_on = v_txn.txn_date - 1
    where user_id = v_txn.user_id and closed_on is null;

  insert into public.financial_months (user_id, opened_on, opening_paycheck_id, label)
  values (v_txn.user_id, v_txn.txn_date, v_txn.id,
          to_char(v_txn.txn_date, 'Mon DD') || ' –')
  returning id into v_month_id;

  update public.transactions
    set financial_month_id = v_month_id where id = v_txn.id;

  return 'opened';
end $$;

-- Resolve an anomaly after the user answers the Raise/Bonus prompt.
-- 'raise'  → writes a new baseline, then opens the month.
-- 'bonus'  → opens the month at the OLD baseline (baseline untouched).
create or replace function public.resolve_paycheck_anomaly(
  p_transaction_id uuid,
  p_resolution     text          -- 'raise' | 'bonus'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_txn record;
begin
  select * into v_txn from public.transactions
  where id = p_transaction_id and user_id = auth.uid() and kind = 'paycheck';

  if v_txn is null then raise exception 'Paycheck transaction not found'; end if;

  if p_resolution = 'raise' then
    insert into public.paycheck_baselines (user_id, expected_amount, effective_from)
    values (v_txn.user_id, v_txn.amount_cad, v_txn.txn_date);
  elsif p_resolution <> 'bonus' then
    raise exception 'Resolution must be raise or bonus';
  end if;

  -- Open the month with tolerance disabled (user has confirmed)
  perform public.register_paycheck(p_transaction_id, 1000000);
end $$;

-- ----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY — strict per-user isolation
-- ----------------------------------------------------------------------------
alter table public.profiles                  enable row level security;
alter table public.categories                enable row level security;
alter table public.paycheck_baselines        enable row level security;
alter table public.financial_months          enable row level security;
alter table public.csv_mappings              enable row level security;
alter table public.csv_imports               enable row level security;
alter table public.transactions              enable row level security;
alter table public.splits                    enable row level security;
alter table public.reimbursements            enable row level security;
alter table public.reimbursement_allocations enable row level security;

create policy "own profile"  on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Uniform owner policies
do $$
declare t text;
begin
  foreach t in array array[
    'categories','paycheck_baselines','financial_months',
    'csv_mappings','csv_imports','transactions','splits','reimbursements'
  ] loop
    execute format(
      'create policy "owner all" on public.%I
         for all using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;

-- Allocations are owned transitively through the reimbursement
create policy "owner via reimbursement" on public.reimbursement_allocations
  for all using (
    exists (select 1 from public.reimbursements r
            where r.id = reimbursement_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.reimbursements r
            where r.id = reimbursement_id and r.user_id = auth.uid())
  );
