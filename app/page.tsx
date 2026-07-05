/**
 * / — the login gateway. Middleware forwards authenticated users to
 * /dashboard before this renders. Structure follows the brand reference:
 * centered surface, lockup, welcome headline, primary (black) Google
 * button, divider, caption footnote.
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
      <div className="tile flex w-full max-w-md flex-col items-center p-8 text-center">
        <h1 className="sr-only">Traces — Track. Budget. Succeed.</h1>
        <Image
          src="/traces-logo.svg"
          alt="Traces — Track. Budget. Succeed."
          width={280}
          height={197}
          priority
          unoptimized
          className="h-auto w-56"
        />

        <h2 className="type-h2 mt-6">Oinc oinc! Welcome to Traces 🐷</h2>
        <p className="type-body-2 mt-2 text-ink-soft">
          Self-hosted finance, traced to the cent. Sign in to open your ledger.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 w-full rounded-lg bg-negative-soft px-4 py-3 text-sm font-medium text-negative"
          >
            {error}
          </p>
        )}

        <div className="mt-6 w-full">
          <GoogleSignIn next={params.next} />
        </div>

        <hr className="mt-6 w-full border-line" />

        <p className="type-caption mt-4 text-ink-faint">
          Google is the only sign-in method. Your data is isolated per account
          and never shared.
        </p>
      </div>
    </main>
  );
}
