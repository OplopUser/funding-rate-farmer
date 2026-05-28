/**
 * Funding Rate Farmer — public API.
 *
 * A multi-venue funding rate farming bot supporting Drift Protocol,
 * Zeta Markets, Mango Markets, and Hyperliquid.
 */

export { type FundingRate, type PerpMarket, type Position, type FarmingOpportunity, Venue, PositionSide } from './types.js';
export { config, type Config } from './config.js';
export { annualizeFundingRate, earningSide, formatApr, formatRate } from './apr.js';
export { scanOpportunities, displayOpportunities } from './scanner.js';
export { openPosition, closePosition, getPositions, getPosition, displayPositions } from './positions.js';
export {
  fetchDriftFundingRates,
  fetchZetaFundingRates,
  fetchMangoFundingRates,
  fetchHyperliquidFundingRates,
} from './fetchers/index.js';
