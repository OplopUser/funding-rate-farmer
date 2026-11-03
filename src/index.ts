/**
 * Funding Rate Farmer: public library API.
 *
 * Scans perpetual funding rates on Hyperliquid and Drift, ranks the side
 * that receives funding, and tracks paper positions. Read-only: nothing in
 * this package signs or sends transactions.
 */

export {
  Venue,
  type PositionSide,
  type FundingRate,
  type VenueFetchResult,
  type FarmingOpportunity,
  type Position,
  type PnlBreakdown,
} from './types.js';
export { loadConfig, parseConfig, type Config, type ConfigResult } from './config.js';
export { annualizeFundingRate, earningSide, formatApr, formatRate, HOURS_PER_YEAR } from './apr.js';
export { rankOpportunities, rateToOpportunity, type RankOptions } from './ranking.js';
export {
  fetchAllRates,
  fetchMarkPrice,
  type ScanOptions,
  type ScanResult,
  type VenueReport,
} from './scanner.js';
export {
  loadPositions,
  savePositions,
  openPaperPosition,
  closePaperPosition,
  resolvePositionId,
  computePnl,
  type ResolveResult,
} from './positions.js';
export * from './fetchers/index.js';
