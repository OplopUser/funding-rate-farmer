/**
 * Perpetual DEX venue identifiers.
 */
export enum Venue {
  DRIFT = 'DRIFT',
  HYPERLIQUID = 'HYPERLIQUID',
}

/**
 * Direction of a trade/position.
 */
export type PositionSide = 'long' | 'short';

/**
 * A funding-rate observation for one market, normalised across venues.
 *
 * Sign convention (same on every venue): a positive `rate` means longs pay
 * shorts; a negative `rate` means shorts pay longs.
 */
export interface FundingRate {
  /** Venue this rate came from */
  venue: Venue;
  /** Market symbol (e.g. "SOL-PERP", "BTC-PERP") */
  marketSymbol: string;
  /** Funding rate per interval as a fraction of notional (0.0001 = 0.01%) */
  rate: number;
  /** Length of one funding interval, in hours */
  intervalHours: number;
  /** Current mark (or oracle) price in USD */
  markPrice: number;
  /** Open interest in USD, if the venue reports it */
  openInterestUsd?: number;
  /** When the venue last updated this rate (if known) */
  updatedAt?: Date;
  /** When this rate was fetched */
  fetchedAt: Date;
}

/**
 * Result of fetching one venue: the usable rates plus any warnings
 * (skipped markets, stale data, etc.).
 */
export interface VenueFetchResult {
  venue: Venue;
  rates: FundingRate[];
  warnings: string[];
}

/**
 * Ranked farming opportunity: the side of a market that receives funding.
 */
export interface FarmingOpportunity {
  venue: Venue;
  marketSymbol: string;
  /** The side that receives funding at the current rate */
  recommendedSide: PositionSide;
  /** Annualized APR earned by `recommendedSide`, as a decimal (always >= 0) */
  annualizedApr: number;
  /** Raw funding rate per interval (venue sign convention, see FundingRate) */
  rawRate: number;
  intervalHours: number;
  /** Mark price in USD at scan time */
  markPrice: number;
  openInterestUsd?: number;
}

/**
 * A paper position, as stored on disk.
 */
export interface Position {
  /** Short random hex identifier */
  id: string;
  venue: Venue;
  marketSymbol: string;
  side: PositionSide;
  /** Notional at entry, in USD */
  sizeUsd: number;
  /** Position size in base units (sizeUsd / entryPrice) */
  baseAmount: number;
  /** Mark price at entry, in USD */
  entryPrice: number;
  /** Annualized APR for `side` at entry, as a decimal */
  enteredApr: number;
  /** ISO timestamp of entry */
  enteredAt: string;
}

/**
 * Paper PnL breakdown for a position at a given mark price.
 */
export interface PnlBreakdown {
  markPrice: number;
  /** PnL from price movement, in USD */
  pricePnl: number;
  /**
   * Estimated funding collected, in USD, assuming the entry APR held for the
   * whole holding period. Real funding varies every interval.
   */
  estFundingPnl: number;
  /** pricePnl + estFundingPnl */
  totalPnl: number;
  /** Holding period, in hours */
  hoursHeld: number;
}
