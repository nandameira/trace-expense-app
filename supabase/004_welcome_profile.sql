-- ============================================================================
-- TRACES — Migration 004: welcome onboarding (profile + avatar + currency)
--
--   profiles.first_name / last_name  -> ENCRYPTED (app-layer AES-GCM; PII
--                                       scope decided in migration 003)
--   profiles.avatar_url              -> public URL into the avatars bucket
--   profiles.welcome_completed_at    -> gates the /welcome redirect
--   profiles.base_currency           -> already exists (001); step 2 updates it
--
-- Run AFTER 003_encryption.sql.
-- ============================================================================

alter table public.profiles
  add column if not exists first_name  text,
  add column if not exists last_name   text,
  add column if not exists avatar_url  text,
  add column if not exists welcome_completed_at timestamptz;

comment on column public.profiles.first_name is 'ENCRYPTED (app-layer AES-256-GCM, enc:v1 format)';
comment on column public.profiles.last_name  is 'ENCRYPTED (app-layer AES-256-GCM, enc:v1 format)';

-- ----------------------------------------------------------------------------
-- Avatar storage: public-read bucket, writes locked to the owner's folder
-- (uploads are keyed "<user_id>/avatar.<ext>"). Guarded so this migration
-- also loads on plain Postgres without Supabase's storage schema.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('avatars', 'avatars', true)
    on conflict (id) do nothing;

    execute $pol$
      create policy "avatars are publicly readable"
        on storage.objects for select
        using (bucket_id = 'avatars')
    $pol$;

    execute $pol$
      create policy "users upload to their own avatar folder"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $pol$;

    execute $pol$
      create policy "users replace their own avatar"
        on storage.objects for update to authenticated
        using (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $pol$;

    execute $pol$
      create policy "users delete their own avatar"
        on storage.objects for delete to authenticated
        using (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $pol$;
  end if;
end $$;
