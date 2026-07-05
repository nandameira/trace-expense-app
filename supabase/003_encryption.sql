-- ============================================================================
-- TRACE EXPENSE — Migration 003: column-level encryption (app-layer AES-GCM)
--
-- Encrypted fields (per product decision):
--   accounts.name, accounts.institution        (financial-institution data)
--   profiles.display_name, profiles.partner_label  (PII)
--
-- Ciphertext is written by the app (lib/crypto.ts) in the format
-- "enc:v1:<iv>:<data>". Postgres stores it as ordinary text; RLS and all
-- non-encrypted SQL behavior are unchanged. Uniqueness on accounts.name
-- moves to a deterministic HMAC blind index, since AES-GCM ciphertext is
-- randomized (same name encrypts differently every time).
--
-- Run AFTER 002_monarch_features.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ACCOUNTS — blind index replaces plaintext uniqueness
-- ----------------------------------------------------------------------------
alter table public.accounts add column name_index text;

comment on column public.accounts.name        is 'ENCRYPTED (app-layer AES-256-GCM, enc:v1 format)';
comment on column public.accounts.institution is 'ENCRYPTED (app-layer AES-256-GCM, enc:v1 format)';
comment on column public.accounts.name_index  is 'HMAC-SHA-256 blind index of normalized name; used for UNIQUE + equality lookups';

-- Existing plaintext rows: leave readable (decryptField passes plaintext
-- through). The app backfills name_index + ciphertext on next write; the
-- helper script in lib/data/accounts.ts (migrateAccountRow) can bulk-run it.

alter table public.accounts drop constraint if exists accounts_user_id_name_key;

-- Partial unique: enforced once a row has been migrated to the new scheme.
create unique index uq_accounts_user_name_index
  on public.accounts (user_id, name_index)
  where name_index is not null;

-- ----------------------------------------------------------------------------
-- 2. PROFILES — PII columns become ciphertext carriers
-- ----------------------------------------------------------------------------
comment on column public.profiles.display_name  is 'ENCRYPTED (app-layer AES-256-GCM, enc:v1 format)';
comment on column public.profiles.partner_label is 'ENCRYPTED (app-layer AES-256-GCM, enc:v1 format)';

-- partner_label previously defaulted to plaintext 'Partner'; the app now
-- owns that default (it must be encrypted with the app key).
alter table public.profiles alter column partner_label drop not null;
alter table public.profiles alter column partner_label drop default;

-- ----------------------------------------------------------------------------
-- 3. SIGNUP TRIGGER — stop persisting plaintext PII
--    The database can't encrypt with the app-held key, so the trigger no
--    longer copies the Google display name. The app encrypts and stores it
--    on first authenticated render instead (see app/(app)/layout.tsx).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, null);   -- name arrives encrypted from the app layer
  return new;
end $$;
