"use client";

/**
 * steps.tsx — the /welcome 3-step onboarding machine.
 *
 * NN/g compliance notes:
 *  - Visibility of system status: stepper at the top of the card announces
 *    "Step N of 3"; completed/active segments highlight in accent green;
 *    buttons have distinct hover (opacity/bg) and disabled states.
 *  - Error prevention & recovery: inline coral errors render below each
 *    field inside a FIXED-HEIGHT slot, so appearing/disappearing messages
 *    never shift the layout; file-type/size problems are caught before
 *    upload with plain-language fixes.
 *  - Recognition over recall: every input has a persistent visible label
 *    above it — placeholders only supplement, never label.
 *  - Aesthetic & minimalist: each step contains only the fields needed to
 *    advance; the avatar is clearly optional.
 */

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { searchCurrencies, CURRENCIES } from "@/lib/currencies";
import { completeWelcome } from "./actions";

const TOTAL_STEPS = 3;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/* ------------------------------------------------------------------------ */
/* Stepper — accent green marks active & completed segments                 */
/* ------------------------------------------------------------------------ */

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2" aria-hidden>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{
              background:
                i < step ? "var(--color-trace)" : "var(--color-line)",
            }}
          />
        ))}
      </div>
      <p className="type-caption text-ink-faint" aria-live="polite">
        Step {step} of {TOTAL_STEPS}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Field — persistent label above input + fixed-height error slot           */
/* ------------------------------------------------------------------------ */

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-label text-ink">
        {label}
      </label>
      {children}
      {/* fixed-height slot: errors never shift the layout */}
      <p
        id={`${id}-error`}
        role={error ? "alert" : undefined}
        className="type-caption min-h-4 text-negative"
      >
        {error ?? ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Main flow                                                                */
/* ------------------------------------------------------------------------ */

export function WelcomeSteps({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1 state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [currency, setCurrency] = useState("CAD");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  /* ----- avatar upload ---------------------------------------------------- */

  const handleAvatar = async (file: File) => {
    setErrors((e) => ({ ...e, avatar: null }));

    const ext = AVATAR_TYPES[file.type];
    if (!ext) {
      setErrors((e) => ({
        ...e,
        avatar: "That file type won't work here — use a PNG, JPG, or WebP.",
      }));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setErrors((e) => ({
        ...e,
        avatar: "That photo is over 2 MB — a smaller version will upload fine.",
      }));
      return;
    }

    setAvatarBusy(true);
    setAvatarPreview(URL.createObjectURL(file));

    const supabase = createClient();
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (error) {
      setErrors((e) => ({
        ...e,
        avatar: "The upload didn't go through — you can retry, or add a photo later from Settings.",
      }));
      setAvatarPreview(null);
      setAvatarBusy(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setAvatarBusy(false);
  };

  /* ----- step transitions -------------------------------------------------- */

  const validateStep1 = () => {
    const next: Record<string, string | null> = {
      firstName: firstName.trim()
        ? null
        : "Please add your first name so we know what to call you.",
      lastName: lastName.trim()
        ? null
        : "Please add your last name to finish your profile.",
    };
    setErrors((e) => ({ ...e, ...next }));
    return !next.firstName && !next.lastName;
  };

  const advanceFrom1 = () => {
    if (validateStep1()) setStep(2);
  };

  const finish = async () => {
    setSaving(true);
    setServerError(null);
    const result = await completeWelcome({
      firstName,
      lastName,
      currency,
      avatarUrl,
    });
    setSaving(false);

    if (!result.ok) {
      if (result.field === "firstName" || result.field === "lastName") {
        setErrors((e) => ({ ...e, [result.field!]: result.error ?? null }));
        setStep(1);
      } else {
        setServerError(result.error ?? "Something went wrong — try again.");
      }
      return;
    }
    setStep(3);
  };

  /* ----- render ------------------------------------------------------------ */

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="tile flex w-full max-w-[500px] flex-col gap-6 p-6">
        {step < 3 && <Stepper step={step} />}

        {step === 1 && (
          <Step1
            firstName={firstName}
            lastName={lastName}
            setFirstName={(v) => {
              setFirstName(v);
              setErrors((e) => ({ ...e, firstName: null }));
            }}
            setLastName={(v) => {
              setLastName(v);
              setErrors((e) => ({ ...e, lastName: null }));
            }}
            avatarPreview={avatarPreview}
            avatarBusy={avatarBusy}
            errors={errors}
            onPickFile={() => fileInput.current?.click()}
            onFile={handleAvatar}
            fileInput={fileInput}
            onNext={advanceFrom1}
          />
        )}

        {step === 2 && (
          <Step2
            currency={currency}
            setCurrency={setCurrency}
            saving={saving}
            serverError={serverError}
            onBack={() => setStep(1)}
            onFinish={finish}
          />
        )}

        {step === 3 && (
          <Step3 firstName={firstName.trim()} onGo={() => router.push("/dashboard")} />
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------------ */
/* Step 1 — Welcome & profile                                               */
/* ------------------------------------------------------------------------ */

function Step1(props: {
  firstName: string;
  lastName: string;
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  avatarPreview: string | null;
  avatarBusy: boolean;
  errors: Record<string, string | null>;
  onPickFile: () => void;
  onFile: (f: File) => void;
  fileInput: React.RefObject<HTMLInputElement | null>;
  onNext: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <>
      <header>
        <h1 className="type-display tracking-tight">
          Every great ledger starts with a name 👤
        </h1>
        <p className="type-body-2 mt-2 text-ink-soft">
          Tell us who's holding the piggy bank — this is how you'll appear
          around Traces.
        </p>
      </header>

      {/* Avatar: circular placeholder + "+" button, doubling as a drop zone */}
      <div className="flex items-center gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) props.onFile(f);
          }}
          className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-colors ${
            dragOver ? "border-ink bg-trace-soft" : "border-line bg-canvas"
          }`}
        >
          {props.avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.avatarPreview}
              alt="Your profile photo preview"
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <Image
              src="/traces-icon.svg"
              alt=""
              width={36}
              height={36}
              unoptimized
              className="rounded-lg opacity-60"
            />
          )}
          <button
            type="button"
            onClick={props.onPickFile}
            disabled={props.avatarBusy}
            aria-label="Add a profile photo"
            className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            +
          </button>
        </div>
        <div className="min-w-0">
          <p className="type-label text-ink">Profile photo (optional)</p>
          <p className="type-caption mt-1 text-ink-faint">
            Drag a photo onto the circle or tap the plus. PNG, JPG, or WebP up
            to 2 MB — square images look best.
          </p>
          <p className="type-caption min-h-4 text-negative" role={props.errors.avatar ? "alert" : undefined}>
            {props.avatarBusy ? "" : (props.errors.avatar ?? "")}
          </p>
        </div>
        <input
          ref={props.fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Upload profile photo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-col">
        <Field id="first-name" label="First name" error={props.errors.firstName}>
          <input
            id="first-name"
            value={props.firstName}
            onChange={(e) => props.setFirstName(e.target.value)}
            placeholder="e.g. Morgan"
            maxLength={40}
            autoComplete="given-name"
            aria-describedby="first-name-error"
            aria-invalid={!!props.errors.firstName}
            className="input w-full focus-visible:outline-2 focus-visible:outline-ink"
          />
        </Field>
        <Field id="last-name" label="Last name" error={props.errors.lastName}>
          <input
            id="last-name"
            value={props.lastName}
            onChange={(e) => props.setLastName(e.target.value)}
            placeholder="e.g. Bacon"
            maxLength={40}
            autoComplete="family-name"
            aria-describedby="last-name-error"
            aria-invalid={!!props.errors.lastName}
            className="input w-full focus-visible:outline-2 focus-visible:outline-ink"
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <button onClick={props.onNext} className="btn-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          Continue
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Step 2 — Currency & localization (searchable combobox)                   */
/* ------------------------------------------------------------------------ */

function Step2(props: {
  currency: string;
  setCurrency: (c: string) => void;
  saving: boolean;
  serverError: string | null;
  onBack: () => void;
  onFinish: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchCurrencies(query), [query]);
  const selected = CURRENCIES.find((c) => c.code === props.currency);

  return (
    <>
      <header>
        <h1 className="type-display tracking-tight">
          Pick your money's mother tongue 🌍
        </h1>
        <p className="type-body-2 mt-2 text-ink-soft">
          Traces will speak this currency everywhere — budgets, charts, and
          totals. You can change it later in Settings.
        </p>
      </header>

      <div className="flex flex-col gap-1.5">
        <label id="currency-label" className="type-label text-ink">
          Primary Currency
        </label>

        <div className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-labelledby="currency-label"
            onClick={() => setOpen((o) => !o)}
            className="input flex w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-ink"
          >
            <span className="flex items-center gap-2.5">
              <span aria-hidden className="text-lg leading-none">
                {selected?.flag}
              </span>
              <span className="font-medium">{selected?.code}</span>
              <span className="text-ink-soft">{selected?.name}</span>
            </span>
            <span aria-hidden className="text-ink-faint">
              ▾
            </span>
          </button>

          {open && (
            <div className="tile absolute z-10 mt-2 flex max-h-72 w-full flex-col overflow-hidden p-2">
              {/* visible filter input at the top of the menu */}
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by code or country"
                aria-label="Search currencies"
                className="input w-full focus-visible:outline-2 focus-visible:outline-ink"
              />
              <ul role="listbox" aria-labelledby="currency-label" className="mt-2 overflow-y-auto">
                {results.map((c) => {
                  const active = c.code === props.currency;
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          props.setCurrency(c.code);
                          setOpen(false);
                          setQuery("");
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-ink ${
                          active ? "bg-trace-soft" : ""
                        }`}
                      >
                        <span aria-hidden className="text-lg leading-none">
                          {c.flag}
                        </span>
                        <span className="w-11 font-medium">{c.code}</span>
                        <span className="text-ink-soft">{c.name}</span>
                        {active && (
                          <span aria-hidden className="ml-auto font-semibold" style={{ color: "var(--color-positive)" }}>
                            ✓
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
                {results.length === 0 && (
                  <li className="type-body-2 px-3 py-4 text-ink-soft">
                    No matches — try the 3-letter code, like USD or EUR.
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <p className="type-caption min-h-4 text-negative" role={props.serverError ? "alert" : undefined}>
          {props.serverError ?? ""}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={props.onBack} className="btn-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          Back
        </button>
        <button
          onClick={props.onFinish}
          disabled={props.saving}
          className="btn-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {props.saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Step 3 — Success & gateway                                               */
/* ------------------------------------------------------------------------ */

function Step3({ firstName, onGo }: { firstName: string; onGo: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <div className="relative">
        <Image
          src="/traces-icon.svg"
          alt=""
          width={96}
          height={96}
          unoptimized
          priority
          className="rounded-3xl"
        />
        {/* success check — accent green micro-highlight */}
        <span
          aria-hidden
          className="absolute -right-2 -bottom-2 flex h-8 w-8 items-center justify-center rounded-full text-base font-semibold text-ink"
          style={{ background: "var(--color-trace)", border: "2px solid var(--color-card)" }}
        >
          ✓
        </span>
      </div>

      <header>
        <h1 className="type-display tracking-tight">
          {firstName ? `You're all set, ${firstName}! 🎉` : "You're all set! 🎉"}
        </h1>
        <p className="type-body-2 mt-3 text-ink-soft">
          Your piggy is fed, your ledger is warmed up, and every dollar from
          here on leaves a trace. Next stop: your budget, built from your real
          spending.
        </p>
      </header>

      <button
        onClick={onGo}
        className="btn-primary w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Go to my Ledger
      </button>
    </div>
  );
}
