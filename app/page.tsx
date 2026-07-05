/**
 * / — the login gateway. Middleware forwards authenticated users to
 * /dashboard before this renders, so this page only ever serves
 * signed-out visitors. Google OAuth is the sole authentication method.
 */

import Image from "next/image";
import { GoogleSignIn } from "@/components/google-sign-in";

const ERROR_COPY: Record<string, string> = {
  auth: "Sign-in didn't complete. Try again.",
  exchange: "Google signed you in, but the session couldn't be created. Try again.",
};

export default async function LoginGateway({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? (ERROR_COPY[params.error] ?? ERROR_COPY.auth) : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="tile relative w-full max-w-sm overflow-hidden p-8">
        <h1 className="sr-only">Traces — Track. Budget. Succeed.</h1>
        <Image
          src="/logo.png"
          alt="Traces — Track. Budget. Succeed."
          width={280}
          height={90}
          priority
          className="h-auto w-full max-w-70"
        />

        <p className="mt-4 text-sm text-ink-soft">
          Self-hosted finance, traced to the cent 🐷 Sign in to open your ledger.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-negative-soft px-4 py-3 text-sm font-medium text-negative"
          >
            {error}
          </p>
        )}

        <div className="mt-6">
          <GoogleSignIn next={params.next} />
        </div>

        <p className="mt-6 text-xs text-ink-faint">
          Google is the only sign-in method. Your data is isolated per account
          and never shared.
        </p>

        {/* signature trace line, quiet */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12 w-full"
          viewBox="0 0 400 48"
          preserveAspectRatio="none"
        >
          <path
            d="M0 36 C 60 36, 80 14, 130 20 S 220 44, 270 30 S 360 8, 400 22"
            fill="none"
            stroke="var(--color-trace)"
            strokeWidth="1.5"
            opacity="0.35"
          />
        </svg>
      </div>
    </main>
  );
}
