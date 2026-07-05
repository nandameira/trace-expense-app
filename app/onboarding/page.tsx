/**
 * /onboarding — first-time setup. Lives OUTSIDE the (app) route group on
 * purpose: the (app) layout redirects budget-less users here, and this
 * page redirects already-configured users back to /dashboard. Keeping
 * them in separate layouts makes a redirect loop structurally impossible.
 * Middleware still requires authentication to reach this route.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "./flow";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Already configured? Straight to the app.
  const { count, error } = await supabase
    .from("budgets")
    .select("id", { count: "exact", head: true });
  if (!error && (count ?? 0) > 0) redirect("/dashboard");

  return <OnboardingFlow />;
}
