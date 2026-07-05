/**
 * /reset-password — the landing page for password-recovery links.
 *
 * The email link round-trips through /auth/callback, which verifies the
 * recovery token and starts a session, then forwards here. Anyone who
 * arrives WITHOUT a session (expired link, direct navigation) is sent
 * back to the gateway with an explanatory error. A signed-in user can
 * also visit this page deliberately to change their password.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-form";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/?error=confirm");

  return <ResetPasswordForm email={user.email ?? ""} />;
}
