/**
 * fifo.ts — First-In, First-Out reimbursement settlement.
 *
 * The authoritative implementation lives in Postgres
 * (public.apply_reimbursement) so settlement is atomic and race-safe.
 * This TypeScript mirror exists for:
 *   - optimistic UI (previewing which expenses a wire will clear),
 *   - unit tests,
 *   - the "what does this wire settle?" breakdown in the ledger drawer.
 */

import type { Millis } from "@/lib/money";

export interface OpenSplit {
  splitId: string;
  description: string;
  fifoDate: string;             // underlying expense date, YYYY-MM-DD
  createdAt: string;            // tiebreaker
  partnerAmount: Millis;
  settledAmount: Millis;
}

export interface Allocation {
  splitId: string;
  description: string;
  fifoDate: string;
  applied: Millis;
  fullySettled: boolean;
}

export interface FifoResult {
  allocations: Allocation[];
  unapplied: Millis;            // credit left over after every split is settled
  totalApplied: Millis;
}

/**
 * Apply `wireAmount` against open splits, oldest expense first.
 * Pure function — does not mutate its inputs.
 */
export function applyReimbursementFifo(
  wireAmount: Millis,
  openSplits: OpenSplit[]
): FifoResult {
  if (wireAmount <= 0) throw new Error("Reimbursement must be positive");

  const queue = [...openSplits]
    .filter((s) => s.settledAmount < s.partnerAmount)
    .sort(
      (a, b) =>
        a.fifoDate.localeCompare(b.fifoDate) ||
        a.createdAt.localeCompare(b.createdAt)
    );

  const allocations: Allocation[] = [];
  let remaining = wireAmount;

  for (const split of queue) {
    if (remaining <= 0) break;
    const outstanding = split.partnerAmount - split.settledAmount;
    const applied = Math.min(remaining, outstanding);

    allocations.push({
      splitId: split.splitId,
      description: split.description,
      fifoDate: split.fifoDate,
      applied,
      fullySettled: applied === outstanding,
    });
    remaining -= applied;
  }

  return {
    allocations,
    unapplied: remaining,
    totalApplied: wireAmount - remaining,
  };
}

/** Partner's outstanding balance for the dashboard tile. */
export function outstandingBalance(splits: OpenSplit[]): Millis {
  return splits.reduce(
    (acc, s) => acc + Math.max(0, s.partnerAmount - s.settledAmount),
    0
  );
}

/** The split dropdown options, exactly per spec. Default = 50. */
export const SPLIT_OPTIONS = [5, 10, 15, 20, 25, 50, 75] as const;
export const DEFAULT_SPLIT = 50;

/** Given a txn amount and the user's kept share, the partner's ledger debt. */
export function partnerShare(txnAmount: Millis, userSharePct: number): Millis {
  return Math.round((Math.abs(txnAmount) * (100 - userSharePct)) / 100);
}
