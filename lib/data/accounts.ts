/**
 * accounts.ts — data-access layer for encrypted entities.
 *
 * The rule: ciphertext never leaves this module. Pages and components
 * call these helpers and only ever see plaintext; every write path
 * encrypts and computes the blind index before touching Supabase.
 * RLS still scopes every query to auth.uid() underneath.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptField, decryptField, blindIndex, isEncrypted } from "@/lib/crypto";

export interface AccountRow {
  id: string;
  name: string;            // decrypted
  institution: string | null; // decrypted
  kind: string;
  is_liability: boolean;
  archived: boolean;
}

/** List the signed-in user's accounts, decrypted for rendering. */
export async function getAccounts(supabase: SupabaseClient): Promise<AccountRow[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, institution, kind, is_liability, archived")
    .order("created_at");
  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (row) => ({
      ...row,
      name: (await decryptField(row.name)) ?? "",
      institution: await decryptField(row.institution),
    }))
  );
}

/** Create an account: encrypt name/institution, set the blind index. */
export async function createAccount(
  supabase: SupabaseClient,
  userId: string,
  input: { name: string; institution?: string; kind: string; isLiability: boolean }
) {
  const { error } = await supabase.from("accounts").insert({
    user_id: userId,
    name: await encryptField(input.name),
    name_index: await blindIndex(input.name),
    institution: await encryptField(input.institution ?? null),
    kind: input.kind,
    is_liability: input.isLiability,
  });
  if (error) {
    // 23505 = unique_violation on (user_id, name_index)
    if (error.code === "23505") throw new Error("An account with that name already exists.");
    throw error;
  }
}

/** Rename an account (re-encrypts and refreshes the blind index). */
export async function renameAccount(
  supabase: SupabaseClient,
  accountId: string,
  newName: string
) {
  const { error } = await supabase
    .from("accounts")
    .update({
      name: await encryptField(newName),
      name_index: await blindIndex(newName),
    })
    .eq("id", accountId); // RLS also enforces ownership
  if (error) throw error;
}

/**
 * One-time migration helper: encrypt any legacy plaintext row in place.
 * Safe to re-run; already-encrypted rows are skipped.
 */
export async function migrateAccountRow(
  supabase: SupabaseClient,
  row: { id: string; name: string; institution: string | null }
) {
  if (isEncrypted(row.name)) return false;
  const { error } = await supabase
    .from("accounts")
    .update({
      name: await encryptField(row.name),
      name_index: await blindIndex(row.name),
      institution: await encryptField(row.institution),
    })
    .eq("id", row.id);
  if (error) throw error;
  return true;
}

// ---------------------------------------------------------------------------
// Profile PII (display_name, partner_label)
// ---------------------------------------------------------------------------

export async function getProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, partner_label")
    .eq("id", userId)
    .single();
  return {
    displayName: await decryptField(data?.display_name ?? null),
    partnerLabel: (await decryptField(data?.partner_label ?? null)) ?? "Partner",
  };
}

/**
 * Backfill the display name on first authenticated render: the signup
 * trigger intentionally stores null (the DB can't hold the app key), so
 * the app encrypts the Google name here. Also upgrades any legacy
 * plaintext value to ciphertext.
 */
export async function ensureEncryptedDisplayName(
  supabase: SupabaseClient,
  userId: string,
  stored: string | null,
  googleName: string | null
): Promise<string | null> {
  if (stored != null && isEncrypted(stored)) return decryptField(stored);

  const plaintext = stored ?? googleName; // legacy plaintext or fresh signup
  if (plaintext == null) return null;

  await supabase
    .from("profiles")
    .update({ display_name: await encryptField(plaintext) })
    .eq("id", userId);
  return plaintext;
}
