/**
 * Funding-rate scanner: fetches every venue concurrently and collects the
 * normalised rates plus per-venue warnings and errors. A failing venue is
 * reported but does not abort the scan.
 */

import { fetchDriftFundingRates } from './fetchers/drift.js';
import { fetchHyperliquidFundingRates } from './fetchers/hyperliquid.js';
import { type FundingRate, Venue } from './types.js';

export interface ScanOptions {
  solanaRpcUrl: string;
  hyperliquidApiUrl: string;
  /** Restrict to these venues (default: all). */
  venues?: Venue[];
  /** Pass through to the Drift fetcher; used for price lookups. */
  includeStale?: boolean;
}

export interface VenueReport {
  venue: Venue;
  count: number;
  warnings: string[];
  error?: string;
}

export interface ScanResult {
  rates: FundingRate[];
  reports: VenueReport[];
}

export async function fetchAllRates(opts: ScanOptions): Promise<ScanResult> {
  const venues = opts.venues ?? [Venue.HYPERLIQUID, Venue.DRIFT];
  const fetchers: Record<Venue, () => ReturnType<typeof fetchHyperliquidFundingRates>> = {
    [Venue.HYPERLIQUID]: () => fetchHyperliquidFundingRates(opts.hyperliquidApiUrl),
    [Venue.DRIFT]: () =>
      fetchDriftFundingRates({ rpcUrl: opts.solanaRpcUrl, includeStale: opts.includeStale }),
  };

  const settled = await Promise.allSettled(venues.map((v) => fetchers[v]()));

  const rates: FundingRate[] = [];
  const reports: VenueReport[] = [];
  settled.forEach((res, i) => {
    const venue = venues[i];
    if (res.status === 'fulfilled') {
      rates.push(...res.value.rates);
      reports.push({ venue, count: res.value.rates.length, warnings: res.value.warnings });
    } else {
      const err = res.reason as Error;
      reports.push({ venue, count: 0, warnings: [], error: err?.message ?? String(err) });
    }
  });
  return { rates, reports };
}

/**
 * Look up the current mark price for one market.
 * Stale Drift markets are included so open positions can still be valued.
 */
export async function fetchMarkPrice(
  venue: Venue,
  marketSymbol: string,
  opts: Omit<ScanOptions, 'venues' | 'includeStale'>,
): Promise<number> {
  const { rates, reports } = await fetchAllRates({ ...opts, venues: [venue], includeStale: true });
  const error = reports[0]?.error;
  if (error) throw new Error(`${venue} price lookup failed: ${error}`);
  const match = rates.find((r) => r.marketSymbol === marketSymbol);
  if (!match) throw new Error(`${venue} has no market ${marketSymbol}`);
  return match.markPrice;
}
