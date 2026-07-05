"use client";

/**
 * analyzing-overlay.tsx — full-screen loading state for the onboarding
 * analysis step. A serif dollar sign pulses while a magnifying glass
 * scans over it (CSS keyframes; globals.css disables the motion under
 * prefers-reduced-motion). Friendly messages cycle underneath.
 */

import { useEffect, useState } from "react";

const MESSAGES = [
  "Reading your statements",
  "Following the money trail",
  "Grouping lookalike merchants",
  "Averaging six months of habits",
  "Sketching your budget",
  "Almost there",
];

export function AnalyzingOverlay() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setMessageIndex((i) => (i + 1) % MESSAGES.length),
      1400
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-canvas"
    >
      <div className="relative h-40 w-40" aria-hidden>
        {/* the subject: a big serif dollar sign */}
        <span className="scan-dollar absolute inset-0 flex items-center justify-center font-display text-8xl font-semibold text-ink">
          $
        </span>

        {/* the magnifying glass, scanning */}
        <svg
          className="scan-glass absolute inset-0 m-auto"
          width="96"
          height="96"
          viewBox="0 0 96 96"
        >
          {/* lens with a soft accent tint so the "found it" area glows */}
          <circle
            cx="40"
            cy="40"
            r="26"
            fill="var(--color-trace)"
            fillOpacity="0.28"
            stroke="var(--color-ink)"
            strokeWidth="5"
          />
          {/* glint */}
          <path
            d="M28 30 A17 17 0 0 1 40 24"
            fill="none"
            stroke="var(--color-card)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.9"
          />
          {/* handle */}
          <line
            x1="59"
            y1="59"
            x2="82"
            y2="82"
            stroke="var(--color-ink)"
            strokeWidth="8"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="text-center">
        <h2 className="type-h2 tracking-tight">
          Studying your spending
        </h2>
        <p key={messageIndex} className="mt-2 text-sm font-medium text-ink-soft">
          {MESSAGES[messageIndex]}
        </p>
      </div>
    </div>
  );
}
