/**
 * Funding rate scanner.
 *
 * Fetches funding rates from all configured venues, normalizes them to
 * annualized APR, ranks by highest earning rate, and returns top
 * opportunities.
 *
 * The scanner accounts for both sides:
 *   - Positive funding rate → shorts earn (longs pay)
 *   - Negative funding rate → longs earn (shorts pay)
 */

import {
  type FundingRate,
  type FarmingOpportunity,
  Venue,
} from './types.js';
import { annualizeFundingRate, earningSide } from './apr.js';
import {
  fetchDriftFundingRates,
  fetchZetaFundingRates,
  fetchMangoFundingRates,
  fetchHyperliquidFundingRates,
} from './fetchers/index.js';
import { config } from './config.js';

/**
 * Fetch funding rates from all configured venues.
 */
async function fetchAllRates(): Promise<FundingRate[]> {
  const results = await Promise.allSettled([
    fetchDriftFundingRates().catch((e) => {
      console.warn('[Scanner] Drift fetch failed:', e.message);
      return [] as FundingRate[];
    }),
    fetchZetaFundingRates().catch((e) => {
      console.warn('[Scanner] Zeta fetch failed:', e.message);
      return [] as FundingRate[];
    }),
    fetchMangoFundingRates().catch((e) => {
      console.warn('[Scanner] Mango fetch failed:', e.message);
      return [] as FundingRate[];
    }),
    fetchHyperliquidFundingRates().catch((e) => {
      console.warn('[Scanner] Hyperliquid fetch failed:', e.message);
      return [] as FundingRate[];
    }),
  ]);

  const allRates: FundingRate[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allRates.push(...result.value);
    }
  }

  return allRates;
}

/**
 * Convert raw funding rates into farming opportunities ranked by APR.
 *
 * For each rate we generate two potential opportunities (one for each
 * side), but only the side that earns funding is included with a
 * positive APR.
 */
function rateToOpportunities(rate: FundingRate): FarmingOpportunity[] {
  const side = earningSide(rate.rate);
  const apr = annualizeFundingRate(rate.rate, rate.intervalHours);

  // The earning side gets the positive APR; the paying side is excluded
  // since we only want profitable opportunities.
  const opportunities: FarmingOpportunity[] = [];

  opportunities.push({
    venue: rate.venue,
    marketSymbol: rate.marketSymbol,
    recommendedSide: side,
    annualizedApr: Math.abs(apr),
    rawRate: rate.rate,
    intervalHours: rate.intervalHours,
    markPrice: 0, // would need separate price fetching
    confidence: computeConfidence(rate),
  });

  return opportunities;
}

/**
 * Compute a confidence score (0-1) for a funding rate opportunity.
 *
 * Factors:
 *   - Recency: rates fetched recently get higher confidence
 *   - Rate magnitude: very extreme rates may be less reliable
 *
 * Currently returns 0.7 for all rates (base confidence), can be enhanced
 * with more sophisticated heuristics.
 */
function computeConfidence(_rate: FundingRate): number {
  // TODO: enhance with:
  //   - Volatility scoring
  //   - Open interest depth
  //   - Historical funding rate stability
  return 0.7;
}

/**
 * Scan all venues for the best funding rate farming opportunities.
 *
 * @param minAprPercent - Minimum APR percentage to include (default from config)
 * @returns Sorted array of opportunities (highest APR first)
 */
export async function scanOpportunities(
  minAprPercent: number = config.MIN_APR_PERCENT,
): Promise<FarmingOpportunity[]> {
  const minAprDecimal = minAprPercent / 100;

  console.log(`\n🔍 Scanning funding rates across all venues...`);
  console.log(`ℹ️  Minimum APR threshold: ${minAprPercent}%\n`);

  const rates = await fetchAllRates();

  if (rates.length === 0) {
    console.log('⚠️  No funding rates fetched from any venue.');
    return [];
  }

  console.log(`📊 Fetched ${rates.length} funding rates from ${uniqueVenues(rates)} venues\n`);

  const opportunities = rates
    .flatMap(rateToOpportunities)
    .filter((opp) => opp.annualizedApr >= minAprDecimal)
    .sort((a, b) => b.annualizedApr - a.annualizedApr);

  return opportunities;
}

/**
 * Count unique venues in the funding rate list.
 */
function uniqueVenues(rates: FundingRate[]): string {
  const venues = new Set(rates.map((r) => r.venue));
  return Array.from(venues).join(', ');
}

/**
 * Display a table of opportunities to console.
 */
export function displayOpportunities(opportunities: FarmingOpportunity[]): void {
  if (opportunities.length === 0) {
    console.log('❌ No opportunities above the minimum APR threshold.');
    return;
  }

  console.log('🏆 TOP FUNDING RATE OPPORTUNITIES\n');
  console.log('Rank  Venue        Market        Side   APR        Interval  Confidence');
  console.log('─'.repeat(75));

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    const rank = (i + 1).toString().padStart(2, ' ');
    const venueStr = opp.venue.padEnd(12, ' ');
    const marketStr = opp.marketSymbol.padEnd(13, ' ');
    const sideStr = opp.recommendedSide.padEnd(6, ' ');
    const aprStr = `${(opp.annualizedApr * 100).toFixed(2)}%`.padStart(8, ' ');
    const intervalStr = `${opp.intervalHours}h`.padEnd(10, ' ');
    const confStr = opp.confidence.toFixed(2);

    console.log(`${rank}    ${venueStr}${marketStr}${sideStr}${aprStr}  ${intervalStr}${confStr}`);
  }
  console.log('');
}
