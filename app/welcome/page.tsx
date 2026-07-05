/**
 * /welcome — first-run, 3-step profile onboarding.
 *
 * Sits OUTSIDE the (app) route group (same structural pattern as
 * /onboarding) so the redirect pair can never loop:
 *   (app) layout  -> /welcome   only when welcome_completed_at is null
 *   this page     -> /dashboard only when welcome_completed_at is set
 * Middleware still requires authentication to get here at all.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WelcomeSteps } from "./steps";

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("welcome_completed_at")
    .eq("id", user.id)
    .single();

  if (!error && profile?.welcome_completed_at) redirect("/dashboard");

  return <WelcomeSteps userId={user.id} />;
}
