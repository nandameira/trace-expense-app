"use server";

/**
 * actions.ts — persist the welcome onboarding.
 *
 * Names are PII (encryption scope from migration 003), so they're
 * encrypted app-side before touching Postgres; display_name is derived
 * ("First Last") and encrypted too. Currency is validated against the
 * known dataset. The avatar URL is only accepted if it points into the
 * user's own folder of the avatars bucket — the client can't write
 * anywhere else anyway (storage RLS), but we validate defensively.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { encryptField } from "@/lib/crypto";
import { CURRENCIES } from "@/lib/currencies";

export interface WelcomePayload {
  firstName: string;
  lastName: string;
  currency: string;
  avatarUrl?: string | null;
}

export interface WelcomeResult {
  ok: boolean;
  error?: string;
  field?: "firstName" | "lastName" | "currency" | "avatar";
}

const NAME = /^[\p{L}\p{M}'’. -]{1,40}$/u;

export async function completeWelcome(payload: WelcomePayload): Promise<WelcomeResult> {
  const firstName = (payload.firstName ?? "").trim();
  const lastName = (payload.lastName ?? "").trim();
  const currency = (payload.currency ?? "").trim().toUpperCase();

  if (!firstName) {
    return { ok: false, field: "firstName", error: "Please add your first name so we know what to call you." };
  }
  if (!NAME.test(firstName)) {
    return { ok: false, field: "firstName", error: "That first name has characters we can't store — letters, spaces, hyphens and apostrophes work." };
  }
  if (!lastName) {
    return { ok: false, field: "lastName", error: "Please add your last name to finish your profile." };
  }
  if (!NAME.test(lastName)) {
    return { ok: false, field: "lastName", error: "That last name has characters we can't store — letters, spaces, hyphens and apostrophes work." };
  }
  if (!CURRENCIES.some((c) => c.code === currency)) {
    return { ok: false, field: "currency", error: "Pick a currency from the list so your totals add up." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired — sign in again." };

  // Avatar URL must live in the caller's own folder of the avatars bucket.
  let avatarUrl: string | null = null;
  if (payload.avatarUrl) {
    const expectedSegment = `/storage/v1/object/public/avatars/${user.id}/`;
    if (!payload.avatarUrl.includes(expectedSegment)) {
      return { ok: false, field: "avatar", error: "That photo didn't upload correctly — try adding it again." };
    }
    avatarUrl = payload.avatarUrl;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: await encryptField(firstName),
      last_name: await encryptField(lastName),
      display_name: await encryptField(`${firstName} ${lastName}`),
      base_currency: currency,
      avatar_url: avatarUrl,
      welcome_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id); // RLS also enforces ownership

  if (error) {
    return { ok: false, error: "We couldn't save your profile just now — give it another try." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
