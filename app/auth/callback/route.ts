/**
 * /auth/callback — completes both auth round-trips:
 *   1. OAuth (Google): ?code=...            -> exchangeCodeForSession
 *   2. Email confirmation links: ?token_hash=...&type=... -> verifyOtp
 *
 * Hardening (unchanged): `next` is validated to a same-origin absolute
 * path, failures land on the gateway with a readable error flag, and the
 * shared server client keeps the cookie adapter consistent with the
 * middleware.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function safePath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safePath(searchParams.get("next"));

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  // Email confirmation / magic-link style round-trip
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return NextResponse.redirect(`${origin}/?error=confirm`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // OAuth (PKCE) round-trip
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/?error=exchange`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // User cancelled at the provider, or the provider returned an error.
  return NextResponse.redirect(`${origin}/?error=auth`);
}
