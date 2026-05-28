/**
 * Perpetual DEX venue identifiers.
 */
export enum Venue {
  DRIFT = 'DRIFT',
  ZETA = 'ZETA',
  MANGO = 'MANGO',
  HYPERLIQUID = 'HYPERLIQUID',
}

/**
 * Direction of a trade/position.
 */
export type PositionSide = 'long' | 'short';

/**
 * Raw funding rate data from a specific venue.
 */
export interface FundingRate {
  /** Venue this rate came from */
  venue: Venue;
  /** Market symbol (e.g. "SOL-PERP", "BTC-PERP") */
  marketSymbol: string;
  /** The raw funding rate as a decimal (e.g. 0.0001 = 0.01%) */
  rate: number;
  /** The interval over which this rate applies, in hours */
  intervalHours: number;
  /** Timestamp when this rate was fetched */
  fetchedAt: Date;
}

/**
 * Perpetual market descriptor.
 */
export interface PerpMarket {
  /** Venue the market lives on */
  venue: Venue;
  /** Market symbol */
  symbol: string;
  /** Human-readable base asset name */
  baseAsset: string;
  /** Current mark price */
  markPrice: number;
  /** Latest funding rate */
  fundingRate: number;
  /** Funding interval in hours */
  fundingIntervalHours: number;
  /** Annualized APR based on latest funding rate */
  aprLong: number;
  /** Annualized APR for short positions (inverse of long APR) */
  aprShort: number;
  /** Open interest (if available) */
  openInterest?: number;
  /** 24h volume (if available) */
  volume24h?: number;
}

/**
 * An active or simulated position.
 */
export interface Position {
  /** Unique position identifier */
  id: string;
  /** Venue where the position is held */
  venue: Venue;
  /** Market symbol */
  marketSymbol: string;
  /** Direction of the position */
  side: PositionSide;
  /** Position size in USD */
  sizeUsd: number;
  /** Entry price */
  entryPrice: number;
  /** Annualized APR when entered */
  enteredApr: number;
  /** Timestamp when position was entered */
  enteredAt: Date;
  /** Current mark price */
  currentPrice?: number;
  /** Unrealized PnL in USD */
  unrealizedPnl?: number;
}

/**
 * Ranked farming opportunity combining funding rate + metadata.
 */
export interface FarmingOpportunity {
  /** Venue offering this opportunity */
  venue: Venue;
  /** Market symbol */
  marketSymbol: string;
  /** Which side pays you (long = collecting funding, shorts pay you) */
  recommendedSide: PositionSide;
  /** Annualized APR for the recommended side */
  annualizedApr: number;
  /** Raw funding rate */
  rawRate: number;
  /** Funding interval in hours */
  intervalHours: number;
  /** Current mark price */
  markPrice: number;
  /** Confidence score (0-1) based on recency, liquidity, etc. */
  confidence: number;
}
