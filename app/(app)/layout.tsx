/**
 * (app) layout — second gate behind the middleware.
 *
 * Re-verifies the user server-side on every render of a protected route
 * (defense-in-depth against any middleware bypass), and performs the
 * profile query. Scoping model for ALL queries in this group:
 *   1. Always query through the cookie-bound server client below — it
 *      carries the user's JWT, so Postgres RLS ("user_id = auth.uid()")
 *      filters every row server-side.
 *   2. Never use a service_role key in app code.
 *   3. Treat .eq("user_id", ...) filters as an optimization only — RLS is
 *      the enforcement boundary even if a filter is forgotten.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureEncryptedDisplayName } from "@/lib/data/accounts";
import { Shell } from "@/components/shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/"); // middleware should have caught this; never trust one gate
  }

  // First-run gates, in order. Both only fire on a SUCCESSFUL read (a
  // query error — e.g. unconfigured demo environment — never redirects),
  // and both targets live outside this layout, so loops are structurally
  // impossible.
  // Gate 1: profile welcome (/welcome) — name, currency, avatar.
  const { data: gateProfile, error: gateError } = await supabase
    .from("profiles")
    .select("welcome_completed_at")
    .eq("id", user.id)
    .single();
  if (!gateError && gateProfile && !gateProfile.welcome_completed_at) {
    redirect("/welcome");
  }

  // Gate 2: budget configuration (/onboarding).
  const { count: budgetCount, error: budgetError } = await supabase
    .from("budgets")
    .select("id", { count: "exact", head: true });
  if (!budgetError && (budgetCount ?? 0) === 0) {
    redirect("/onboarding");
  }

  // Scoped query: RLS restricts profiles to id = auth.uid().
  // display_name is encrypted at rest; the trigger stores null on signup,
  // so this also backfills the encrypted Google name on first render.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = await ensureEncryptedDisplayName(
    supabase,
    user.id,
    profile?.display_name ?? null,
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? null
  );

  return <Shell displayName={displayName ?? "Account"}>{children}</Shell>;
}
