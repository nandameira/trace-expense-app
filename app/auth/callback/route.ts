/**
 * /auth/callback — completes the Google OAuth (PKCE) round-trip.
 *
 * Hardening:
 *   - `next` is validated to a same-origin absolute path (no open redirect).
 *   - A failed code exchange redirects to the gateway with an error flag
 *     instead of silently pretending the user is signed in.
 *   - Uses the shared server client (modern getAll/setAll cookie adapter),
 *     matching the middleware so chunked auth cookies survive refreshes.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safePath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safePath(searchParams.get("next"));

  if (!code) {
    // User cancelled at Google, or the provider returned an error.
    return NextResponse.redirect(`${origin}/?error=auth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/?error=exchange`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
