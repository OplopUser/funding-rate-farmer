/**
 * Turn normalised funding rates into ranked farming opportunities.
 * Pure functions, no I/O.
 */

import { annualizeFundingRate, earningSide } from './apr.js';
import type { FarmingOpportunity, FundingRate } from './types.js';

export interface RankOptions {
  /** Minimum APR for the earning side, in percent (e.g. 20 = 20%). */
  minAprPercent?: number;
  /**
   * Minimum open interest in USD. Markets that do not report OI are kept.
   */
  minOpenInterestUsd?: number;
}

/**
 * The opportunity on one market: the side that receives funding and the
 * (non-negative) APR it earns at the current rate.
 */
export function rateToOpportunity(rate: FundingRate): FarmingOpportunity {
  return {
    venue: rate.venue,
    marketSymbol: rate.marketSymbol,
    recommendedSide: earningSide(rate.rate),
    annualizedApr: Math.abs(annualizeFundingRate(rate.rate, rate.intervalHours)),
    rawRate: rate.rate,
    intervalHours: rate.intervalHours,
    markPrice: rate.markPrice,
    openInterestUsd: rate.openInterestUsd,
  };
}

/**
 * Filter and sort opportunities: highest APR first; ties broken by larger
 * open interest, then by venue and symbol for a stable order.
 */
export function rankOpportunities(
  rates: FundingRate[],
  { minAprPercent = 0, minOpenInterestUsd = 0 }: RankOptions = {},
): FarmingOpportunity[] {
  const minApr = minAprPercent / 100;
  return rates
    .map(rateToOpportunity)
    .filter((o) => o.annualizedApr > 0 && o.annualizedApr >= minApr)
    .filter((o) => o.openInterestUsd === undefined || o.openInterestUsd >= minOpenInterestUsd)
    .sort(
      (a, b) =>
        b.annualizedApr - a.annualizedApr ||
        (b.openInterestUsd ?? 0) - (a.openInterestUsd ?? 0) ||
        a.venue.localeCompare(b.venue) ||
        a.marketSymbol.localeCompare(b.marketSymbol),
    );
}
