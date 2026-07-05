/**
 * middleware.ts — session refresh + route gating.
 *
 * Rules:
 *   - `/` is the login gateway. Unauthenticated users may see only `/`
 *     and `/auth/*` (OAuth round-trip). Everything else redirects to `/`.
 *   - Authenticated users visiting `/` are forwarded to `/dashboard`.
 *   - Always return the Supabase-managed response so refreshed auth
 *     cookies reach the browser.
 *
 * Defense-in-depth note: middleware is the first gate, not the only one.
 * app/(app)/layout.tsx re-verifies the user server-side, and RLS in
 * Postgres is the final enforcement boundary.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/auth"]; // besides "/" itself

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: object }[]
        ) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // IMPORTANT: getUser() validates the JWT against Supabase Auth on every
  // request (never trust getSession() alone in middleware — it only reads cookies).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isRoot = pathname === "/";
  const isPublic = isRoot || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    // Unauthenticated -> login gateway, remembering where they were headed.
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = pathname === "/dashboard" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (user && isRoot) {
    // Already signed in -> straight to the app.
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
