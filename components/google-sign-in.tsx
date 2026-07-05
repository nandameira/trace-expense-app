"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Allow only same-origin absolute paths ("/budget"), never "//" or full URLs. */
function safePath(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export function GoogleSignIn({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          safePath(next)
        )}`,
      },
    });
    if (error) {
      setError("Couldn't reach Google. Check your connection and try again.");
      setPending(false);
    }
    // On success the browser navigates away to Google.
  };

  return (
    <div>
      <button
        onClick={handleLogin}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-full bg-trace px-6 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-85 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
          <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-3.9-13.6-9.4l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
