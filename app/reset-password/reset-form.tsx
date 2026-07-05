"use client";

/**
 * reset-form.tsx — set a new password (recovery session already active).
 * Same M3 rules as the rest of auth: labels above inputs, fixed-height
 * coral error slots, black focus outlines, one primary action.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD = 8;

export function ResetPasswordForm({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (password.length < MIN_PASSWORD) {
      next.password = `Passwords need at least ${MIN_PASSWORD} characters.`;
    }
    if (confirm !== password) {
      next.confirm = "These passwords don't match — retype the second one.";
    }
    setErrors(next);
    if (next.password || next.confirm) return;

    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (error) {
      const m = error.message.toLowerCase();
      setErrors({
        form: m.includes("different from the old")
          ? "That's your current password — pick a new one."
          : m.includes("rate limit") || m.includes("too many")
            ? "Too many attempts — take a short breather and try again in a minute."
            : "We couldn't update your password just now — try again.",
      });
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="tile flex w-full max-w-[500px] flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Image src="/traces-icon.svg" alt="" width={36} height={36} unoptimized className="rounded-lg" />
          <div>
            <h1 className="type-h2 tracking-tight">Choose a new password 🔑</h1>
            <p className="type-caption mt-1 text-ink-faint">for {email}</p>
          </div>
        </div>

        {done ? (
          <div
            role="status"
            className="rounded-lg px-4 py-4"
            style={{ background: "var(--color-trace-soft)" }}
          >
            <p className="type-label text-ink">Password updated</p>
            <p className="type-body-2 mt-1.5 text-ink-soft">
              You're signed in with your new password — taking you to your
              ledger.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-password" className="type-label text-ink">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((er) => ({ ...er, password: undefined }));
                }}
                placeholder="At least 8 characters"
                aria-invalid={!!errors.password}
                aria-describedby="new-password-error"
                className="input w-full focus-visible:outline-2 focus-visible:outline-ink"
              />
              <p id="new-password-error" role={errors.password ? "alert" : undefined} className="type-caption min-h-4 text-negative">
                {errors.password ?? ""}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-password" className="type-label text-ink">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErrors((er) => ({ ...er, confirm: undefined }));
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Same password again"
                aria-invalid={!!errors.confirm}
                aria-describedby="confirm-password-error"
                className="input w-full focus-visible:outline-2 focus-visible:outline-ink"
              />
              <p id="confirm-password-error" role={errors.confirm ? "alert" : undefined} className="type-caption min-h-4 text-negative">
                {errors.confirm ?? ""}
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
              {pending ? "Updating…" : "Update password"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
