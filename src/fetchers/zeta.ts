/**
 * Zeta Markets funding rate fetcher.
 *
 * Zeta Markets is a Solana-based perp DEX. Funding is settled every
 * 1 hour on Zeta.
 *
 * Integration approach:
 *   Try to use @zetamarkets/sdk first using the CrossClient class.
 *   If unavailable, fall back to a REST API (ZETA_API_URL env var).
 *
 * The Zeta SDK's CrossClient exposes market states including latest
 * funding rates.
 */

import { type FundingRate, Venue } from '../types.js';
import { config } from '../config.js';
import { annualizeFundingRate, earningSide } from '../apr.js';

const FUNDING_INTERVAL_HOURS = 1;

const ZETA_MARKETS: Array<{ symbol: string; baseAsset: string; zetaGroup: string }> = [
  { symbol: 'SOL-PERP', baseAsset: 'SOL', zetaGroup: 'SOL' },
  { symbol: 'BTC-PERP', baseAsset: 'BTC', zetaGroup: 'BTC' },
  { symbol: 'ETH-PERP', baseAsset: 'ETH', zetaGroup: 'ETH' },
  { symbol: 'APT-PERP', baseAsset: 'APT', zetaGroup: 'APT' },
  { symbol: 'ARB-PERP', baseAsset: 'ARB', zetaGroup: 'ARB' },
  { symbol: 'DOGE-PERP', baseAsset: 'DOGE', zetaGroup: 'DOGE' },
  { symbol: 'OP-PERP', baseAsset: 'OP', zetaGroup: 'OP' },
  { symbol: 'SUI-PERP', baseAsset: 'SUI', zetaGroup: 'SUI' },
  { symbol: 'TIA-PERP', baseAsset: 'TIA', zetaGroup: 'TIA' },
  { symbol: 'WIF-PERP', baseAsset: 'WIF', zetaGroup: 'WIF' },
];

/**
 * Fetch funding rates from Zeta Markets.
 */
export async function fetchZetaFundingRates(): Promise<FundingRate[]> {
  try {
    return await fetchViaSdk();
  } catch (sdkErr) {
    console.warn(
      '[Zeta] SDK fetch failed, falling back to REST API:',
      (sdkErr as Error).message,
    );
    return await fetchViaRest();
  }
}

/**
 * Attempt to fetch using the @zetamarkets/sdk.
 * The SDK exports a CrossClient class for cross-margin functionality.
 */
async function fetchViaSdk(): Promise<FundingRate[]> {
  let CrossClientType: any;
  try {
    const zetaSdk = await import('@zetamarkets/sdk');
    CrossClientType = zetaSdk.CrossClient;
  } catch {
    throw new Error('@zetamarkets/sdk not installed');
  }

  const { Connection, PublicKey } = await import('@solana/web3.js');
  const connection = new Connection(config.HELIOS_RPC_URL, 'confirmed');

  // CrossClient.load() initializes from on-chain data
  const crossClient = new CrossClientType({ connection });
  await crossClient.load();

  const rates: FundingRate[] = [];

  for (const market of ZETA_MARKETS) {
    try {
      const cross = crossClient.getCross(market.zetaGroup);
      if (!cross) continue;

      const fundingRate: number = cross.fundingRate;
      rates.push({
        venue: Venue.ZETA,
        marketSymbol: market.symbol,
        rate: fundingRate,
        intervalHours: FUNDING_INTERVAL_HOURS,
        fetchedAt: new Date(),
      });
    } catch {
      // Skip markets that aren't loaded
    }
  }

  return rates;
}

/**
 * Fallback REST API-based fetching.
 */
async function fetchViaRest(): Promise<FundingRate[]> {
  if (!config.ZETA_API_URL) {
    console.warn('[Zeta] No ZETA_API_URL configured, skipping REST fallback');
    return [];
  }

  const { default: axios } = await import('axios');

  const resp = await axios.get(`${config.ZETA_API_URL}/markets`, {
    timeout: 10_000,
  });

  const markets = resp.data as Array<{
    symbol: string;
    fundingRate: number;
  }>;

  return markets
    .filter((m) => ZETA_MARKETS.some((zm) => zm.symbol === m.symbol))
    .map((m) => ({
      venue: Venue.ZETA,
      marketSymbol: m.symbol,
      rate: m.fundingRate,
      intervalHours: FUNDING_INTERVAL_HOURS,
      fetchedAt: new Date(),
    }));
}

/**
 * Get the earning side for a Zeta funding rate.
 */
export function zetaEarningSide(rate: number) {
  return earningSide(rate);
}

/**
 * Annualize a Zeta funding rate.
 */
export function zetaAnnualizedApr(rate: number): number {
  return annualizeFundingRate(rate, FUNDING_INTERVAL_HOURS);
}
