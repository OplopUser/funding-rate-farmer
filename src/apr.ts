/**
 * Effective APR calculation from funding rates.
 *
 * Funding rates on perp DEXes are periodic payments between long and short
 * positions. The funding interval varies by venue.
 *
 * Standard formula:
 *   APR = hourly_rate × 24 × 365  (for 1h funding intervals)
 *   APR = 8h_rate × 3 × 365       (for 8h funding intervals)
 *
 * A positive rate means longs pay shorts (short positions earn funding).
 * A negative rate means shorts pay longs (long positions earn funding).
 */

import { type PositionSide } from './types.js';

/**
 * Compute the annualized APR from a raw funding rate.
 *
 * @param rate       - Raw funding rate as decimal (e.g. 0.0001 for 0.01%)
 * @param intervalH  - Funding interval in hours (1, 8, etc.)
 * @returns          - Annualized APR as a decimal (e.g. 0.20 = 20% APR)
 */
export function annualizeFundingRate(rate: number, intervalH: number): number {
  const intervalsPerDay = 24 / intervalH;
  return rate * intervalsPerDay * 365;
}

/**
 * Determine which side earns the funding payment.
 *
 * Positive funding rate → longs pay shorts → short side earns.
 * Negative funding rate → shorts pay longs → long side earns.
 *
 * @param rate - Raw funding rate
 * @returns The position side that would earn funding
 */
export function earningSide(rate: number): PositionSide {
  return rate > 0 ? 'short' : 'long';
}

/**
 * Format an APR value as a human-readable percentage string.
 */
export function formatApr(aprDecimal: number): string {
  const pct = aprDecimal * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Format a raw funding rate as a percentage string.
 */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}
