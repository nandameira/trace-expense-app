/**
 * fx.ts — historical exchange-rate fallback.
 *
 * Used ONLY when a bank CSV row is in a foreign currency and does not
 * carry a settled CAD amount. The returned rate is an ESTIMATE, so every
 * transaction converted this way is flagged `fx_estimated = true` and
 * rendered in the UI with a ⚠ warning icon.
 *
 * The provider is an interface so you can swap xe.com, frankfurter.app,
 * or Bank of Canada Valet without touching ingestion code.
 */

export interface FxProvider {
  /** Rate to multiply 1 unit of `from` into CAD on `date` (YYYY-MM-DD). */
  historicalRateToCad(from: string, date: string): Promise<number>;
}

/** Free, no-key ECB-backed provider — good default for self-hosting. */
export class FrankfurterProvider implements FxProvider {
  async historicalRateToCad(from: string, date: string): Promise<number> {
    const res = await fetch(`https://api.frankfurter.app/${date}?from=${from}&to=CAD`, {
      // Next.js data-cache hint — historical rates never change
      next: { revalidate: 60 * 60 * 24 * 365 },
    } as RequestInit);
    if (!res.ok) throw new Error(`FX lookup failed: ${from}→CAD @ ${date}`);
    const data = (await res.json()) as { rates: { CAD: number } };
    return data.rates.CAD;
  }
}

/** In-memory memoization so a 500-row CSV doesn't fire 500 requests. */
export function withCache(provider: FxProvider): FxProvider {
  const cache = new Map<string, Promise<number>>();
  return {
    historicalRateToCad(from, date) {
      const key = `${from}:${date}`;
      if (!cache.has(key)) cache.set(key, provider.historicalRateToCad(from, date));
      return cache.get(key)!;
    },
  };
}
