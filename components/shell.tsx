"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", glyph: "◧" },
  { href: "/budget", label: "Budget", glyph: "▤" },
  { href: "/accounts", label: "Net worth", glyph: "◔" },
  { href: "/recurring", label: "Recurring", glyph: "↻" },
  { href: "/goals", label: "Goals", glyph: "◎" },
  { href: "/settings/budgets", label: "Settings", glyph: "⚙" },
];

export function Shell({
  children,
  displayName,
}: {
  children: React.ReactNode;
  displayName?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line px-4 py-8 md:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-2">
          <Image
            src="/app-icon.png"
            alt=""
            width={26}
            height={26}
            className="rounded-md"
            priority
          />
          <span className="font-display text-lg font-semibold tracking-tight">
            Traces
          </span>
        </Link>

        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trace ${
                  active
                    ? "bg-trace text-ink"
                    : "text-ink-soft hover:bg-card hover:text-ink"
                }`}
              >
                <span aria-hidden className={active ? "text-ink" : "text-ink-faint"}>
                  {item.glyph}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3 px-2">
          {displayName && (
            <p className="truncate text-xs font-medium text-ink-soft" title={displayName}>
              {displayName}
            </p>
          )}
          {/* POST so prefetching or a crafted <img> can't end the session */}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-left text-xs font-semibold text-ink-faint transition-colors hover:text-negative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trace"
            >
              Sign out
            </button>
          </form>
          <p className="text-xs text-ink-faint">Self-hosted · CAD</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
