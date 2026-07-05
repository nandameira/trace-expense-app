/**
 * client.ts — browser-side Supabase client for Client Components
 * (the Google sign-in button). createBrowserClient memoizes internally,
 * so calling this per-component is safe.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
