/**
 * /auth/signout — POST-only sign-out (POST so a crafted <img> tag or
 * prefetched link can't end a session). Clears the Supabase session
 * cookies and returns to the login gateway.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
