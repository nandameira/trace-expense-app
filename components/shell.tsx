"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", glyph: "◧" },
  { href: "/budget", label: "Budget", glyph: "▤" },
  { href: "/accounts", label: "Net worth", glyph: "◔" },
  { href: "/recurring", label: "Recurring", glyph: "↻" },
  { href: "/goals", label: "Goals", glyph: "◎" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line px-4 py-8 md:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-2">
          {/* wordmark: the trace line runs through the name */}
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
            <rect width="22" height="22" rx="6" fill="var(--color-trace)" />
            <path
              d="M4 13 L8 9 L12 14 L18 7"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-display text-lg font-semibold tracking-tight">
            Trace
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
                    ? "bg-card text-ink shadow-tile"
                    : "text-ink-soft hover:bg-card hover:text-ink"
                }`}
              >
                <span aria-hidden className={active ? "text-trace" : "text-ink-faint"}>
                  {item.glyph}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-2 text-xs text-ink-faint">
          Self-hosted · CAD
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
