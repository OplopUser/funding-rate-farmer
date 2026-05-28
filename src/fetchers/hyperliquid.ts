/**
 * Hyperliquid funding rate fetcher.
 *
 * Hyperliquid is a standalone L1 for perp trading. It provides a
 * public REST API at https://api.hyperliquid.xyz.
 *
 * Integration approach:
 *   POST to https://api.hyperliquid.xyz/info with:
 *     {"type": "metaAndAssetCtxs"}
 *
 * Response:
 *   [
 *     { "universe": [{"name": "SOL", ...}, ...] },
 *     [{"funding": "0.0001", ...}, ...]
 *   ]
 *
 * The asset contexts array (index 1) contains funding rates for each
 * market. The funding field is the 1h funding rate as a decimal.
 *
 * Hyperliquid funding is settled every 1 hour. So:
 *   APR ≈ hourly_rate × 24 × 365
 */

import { type FundingRate, Venue } from '../types.js';
import { config } from '../config.js';
import { annualizeFundingRate } from '../apr.js';

const FUNDING_INTERVAL_HOURS = 1;
const HYPERLIQUID_API = config.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz';

/**
 * Response shape from Hyperliquid's metaAndAssetCtxs endpoint.
 */
interface HyperliquidMetaResponse {
  universe: Array<{
    name: string;
    szDecimals?: number;
    maxLeverage?: number;
  }>;
}

interface HyperliquidAssetCtx {
  funding: string; // "0.000123" format
  markPx?: string;
  openInterest?: string;
  volume24h?: string;
}

/**
 * Fetch funding rates from Hyperliquid.
 *
 * No API key required for public endpoints.
 */
export async function fetchHyperliquidFundingRates(): Promise<FundingRate[]> {
  const { default: axios } = await import('axios');

  const resp = await axios.post(
    `${HYPERLIQUID_API}/info`,
    { type: 'metaAndAssetCtxs' },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10_000,
    },
  );

  const data = resp.data as [HyperliquidMetaResponse, HyperliquidAssetCtx[]];

  if (!Array.isArray(data) || data.length < 2) {
    throw new Error('Unexpected Hyperliquid API response format');
  }

  const [meta, assetCtxs] = data;

  if (!meta?.universe || !Array.isArray(assetCtxs)) {
    throw new Error('Invalid Hyperliquid response structure');
  }

  if (meta.universe.length !== assetCtxs.length) {
    console.warn(
      `[Hyperliquid] Mismatch: ${meta.universe.length} markets but ${assetCtxs.length} asset contexts`,
    );
  }

  const rates: FundingRate[] = [];

  for (let i = 0; i < meta.universe.length; i++) {
    const market = meta.universe[i];
    const ctx = assetCtxs[i];

    if (!market || !ctx) continue;

    const fundingStr = ctx.funding;
    if (!fundingStr) continue;

    const fundingRate = parseFloat(fundingStr);

    if (isNaN(fundingRate)) {
      console.warn(`[Hyperliquid] Invalid funding rate for ${market.name}: ${fundingStr}`);
      continue;
    }

    rates.push({
      venue: Venue.HYPERLIQUID,
      marketSymbol: `${market.name}-PERP`,
      rate: fundingRate,
      intervalHours: FUNDING_INTERVAL_HOURS,
      fetchedAt: new Date(),
    });
  }

  return rates;
}

/**
 * Annualize a Hyperliquid funding rate.
 * Hyperliquid uses 1h funding intervals.
 */
export function hyperliquidAnnualizedApr(rate: number): number {
  return annualizeFundingRate(rate, FUNDING_INTERVAL_HOURS);
}
