/**
 * Funding-rate normalisation.
 *
 * Funding rates on perp DEXes are periodic payments between long and short
 * positions, quoted per funding interval. To compare venues we annualise:
 *
 *   APR = rate_per_interval × (24 / interval_hours) × 365
 *
 * Sign convention used throughout this project (it matches both Drift and
 * Hyperliquid):
 *   positive rate → longs pay shorts → the short side earns
 *   negative rate → shorts pay longs → the long side earns
 */

import type { PositionSide } from './types.js';

export const HOURS_PER_YEAR = 24 * 365;

/**
 * Annualise a per-interval funding rate (simple, not compounded).
 *
 * @param rate      - Funding rate per interval as a decimal (0.0001 = 0.01%)
 * @param intervalH - Funding interval in hours (must be > 0)
 * @returns           Annualised rate as a decimal (0.20 = 20% APR), sign preserved
 */
export function annualizeFundingRate(rate: number, intervalH: number): number {
  if (!(intervalH > 0)) {
    throw new RangeError(`Funding interval must be positive, got ${intervalH}`);
  }
  return rate * (HOURS_PER_YEAR / intervalH);
}

/**
 * The side that receives funding at this rate. A zero rate pays nobody;
 * by convention it maps to 'long' (and annualises to 0% APR).
 */
export function earningSide(rate: number): PositionSide {
  return rate > 0 ? 'short' : 'long';
}

/**
 * Format an APR decimal as a signed percentage string, e.g. "+12.34%".
 */
export function formatApr(aprDecimal: number): string {
  const pct = aprDecimal * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Format a raw funding rate as a percentage string, e.g. "0.0100%".
 */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}
