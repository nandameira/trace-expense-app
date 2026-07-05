"use client";

/**
 * auth-form.tsx — email + password sign-in / sign-up.
 *
 * Two modes behind an accessible tab pair. Errors render inline in coral
 * inside fixed-height slots (no layout shift). Sign-up handles both
 * Supabase configurations: if email confirmations are ON (the default),
 * we show a "check your inbox" notice; if OFF, the session starts
 * immediately and we head to the dashboard.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function friendlyAuthError(message: string, mode: Mode): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match our records — check for typos and try again.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "An account with this email already exists — switch to Sign in.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts — take a short breather and try again in a minute.";
  }
  if (m.includes("email not confirmed")) {
    return "Your email isn't confirmed yet — check your inbox for the confirmation link.";
  }
  if (m.includes("password")) {
    return `Passwords need at least ${MIN_PASSWORD} characters.`;
  }
  return mode === "signup"
    ? "We couldn't create your account just now — try again."
    : "Sign-in didn't work just now — try again.";
}

export function AuthForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const validate = () => {
    const next: typeof errors = {};
    if (!EMAIL.test(email.trim())) {
      next.email = "That doesn't look like an email address — check the format.";
    }
    if (password.length < MIN_PASSWORD) {
      next.password = `Passwords need at least ${MIN_PASSWORD} characters.`;
    }
    setErrors(next);
    return !next.email && !next.password;
  };

  const submit = async () => {
    if (!validate()) return;
    setPending(true);
    setErrors({});
    const supabase = createClient();
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrors({ form: friendlyAuthError(error.message, mode) });
        setPending(false);
        return;
      }
      router.push(safeNext);
      router.refresh();
      return;
    }

    // signup
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    });
    if (error) {
      setErrors({ form: friendlyAuthError(error.message, mode) });
      setPending(false);
      return;
    }
    // Existing account signing up again returns a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      setErrors({ form: "An account with this email already exists — switch to Sign in." });
      setPending(false);
      return;
    }
    if (data.session) {
      // Confirmations disabled: session starts immediately.
      router.push(safeNext);
      router.refresh();
      return;
    }
    setConfirmSent(true);
    setPending(false);
  };

  if (confirmSent) {
    return (
      <div
        role="status"
        className="w-full rounded-lg px-4 py-4 text-left"
        style={{ background: "var(--color-trace-soft)" }}
      >
        <p className="type-label text-ink">Confirm your email to finish up</p>
        <p className="type-body-2 mt-1.5 text-ink-soft">
          We sent a confirmation link to {email.trim()}. Click it and you'll land
          right back here, signed in and ready to go.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full text-left">
      {/* mode tabs */}
      <div
        role="tablist"
        aria-label="Sign in or create an account"
        className="flex rounded-lg border border-line bg-canvas p-1"
      >
        {(
          [
            ["signin", "Sign in"],
            ["signup", "Create account"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setErrors({});
            }}
            className={`type-label flex-1 rounded-md px-4 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-ink ${
              mode === m ? "bg-card text-ink shadow-tile" : "text-ink-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="auth-email" className="type-label text-ink">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors((er) => ({ ...er, email: undefined }));
            }}
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            aria-describedby="auth-email-error"
            className="input w-full focus-visible:outline-2 focus-visible:outline-ink"
          />
          <p id="auth-email-error" role={errors.email ? "alert" : undefined} className="type-caption min-h-4 text-negative">
            {errors.email ?? ""}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="auth-password" className="type-label text-ink">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((er) => ({ ...er, password: undefined }));
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            aria-invalid={!!errors.password}
            aria-describedby="auth-password-error"
            className="input w-full focus-visible:outline-2 focus-visible:outline-ink"
          />
          <p id="auth-password-error" role={errors.password ? "alert" : undefined} className="type-caption min-h-4 text-negative">
            {errors.password ?? ""}
          </p>
        </div>

        <p role={errors.form ? "alert" : undefined} className="type-caption min-h-4 text-negative">
          {errors.form ?? ""}
        </p>

        <button
          onClick={submit}
          disabled={pending}
          className="btn-primary mt-2 w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {pending
            ? mode === "signin"
              ? "Signing in…"
              : "Creating your account…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </div>
    </div>
  );
}
