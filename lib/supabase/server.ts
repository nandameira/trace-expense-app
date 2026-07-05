/**
 * server.ts — server-side Supabase client for Server Components,
 * Route Handlers, and Server Actions. Uses the modern getAll/setAll
 * cookie adapter; the anon key is safe to expose because Row Level
 * Security is the enforcement boundary.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: object }[]
        ) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component (read-only cookies).
            // Safe to ignore: middleware refreshes the session.
          }
        },
      },
    }
  );
}
