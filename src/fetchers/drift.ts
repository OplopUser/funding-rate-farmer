/**
 * Drift Protocol funding rate fetcher.
 *
 * Drift is the largest perp DEX on Solana. Funding is settled every
 * hour (1h intervals) on Drift v2.
 *
 * Integration approach:
 *   Use @drift-labs/sdk to connect to the Drift program on Solana.
 *   The SDK's DriftClient provides access to perp market accounts which
 *   contain the latest funding rate via the `fundingRate` field on each
 *   market account.
 *
 * If the SDK is unavailable or RPC fails, falls back to a configurable
 * REST API endpoint (DRIFT_API_URL env var).
 */

import { type FundingRate, Venue } from '../types.js';
import { config } from '../config.js';
import { annualizeFundingRate, earningSide } from '../apr.js';

const FUNDING_INTERVAL_HOURS = 1;
const DRIFT_PERP_MARKETS: Array<{ symbol: string; baseAsset: string }> = [
  { symbol: 'SOL-PERP', baseAsset: 'SOL' },
  { symbol: 'BTC-PERP', baseAsset: 'BTC' },
  { symbol: 'ETH-PERP', baseAsset: 'ETH' },
  { symbol: 'APT-PERP', baseAsset: 'APT' },
  { symbol: 'ARB-PERP', baseAsset: 'ARB' },
  { symbol: 'DOGE-PERP', baseAsset: 'DOGE' },
  { symbol: 'BNB-PERP', baseAsset: 'BNB' },
  { symbol: 'OP-PERP', baseAsset: 'OP' },
  { symbol: 'SUI-PERP', baseAsset: 'SUI' },
  { symbol: 'TIA-PERP', baseAsset: 'TIA' },
  { symbol: 'WIF-PERP', baseAsset: 'WIF' },
  { symbol: 'JUP-PERP', baseAsset: 'JUP' },
  { symbol: 'RENDER-PERP', baseAsset: 'RENDER' },
  { symbol: 'PYTH-PERP', baseAsset: 'PYTH' },
];

/**
 * Fetch funding rates from Drift Protocol.
 *
 * Attempts SDK-based fetching first; falls back to REST API.
 */
export async function fetchDriftFundingRates(): Promise<FundingRate[]> {
  try {
    return await fetchViaSdk();
  } catch (sdkErr) {
    console.warn(
      '[Drift] SDK fetch failed, falling back to REST API:',
      (sdkErr as Error).message,
    );
    return await fetchViaRest();
  }
}

/**
 * Fetch funding rates using the @drift-labs/sdk.
 */
async function fetchViaSdk(): Promise<FundingRate[]> {
  const { Connection, PublicKey } = await import('@solana/web3.js');

  // Dynamic import for optional SDK
  let DriftClient: any;
  try {
    const driftSdk = await import('@drift-labs/sdk');
    DriftClient = driftSdk.DriftClient;
  } catch {
    throw new Error('@drift-labs/sdk not installed');
  }

  const connection = new Connection(config.HELIOS_RPC_URL, 'confirmed');
  const driftClient = new DriftClient({
    connection,
    wallet: { publicKey: PublicKey.default } as any,
    env: 'mainnet-beta',
  });

  await driftClient.subscribe();

  const perpMarketAccounts = driftClient.getPerpMarketAccounts();
  const oracleData = driftClient.getOracleDataMap();

  const rates: FundingRate[] = [];

  for (const marketConfig of DRIFT_PERP_MARKETS) {
    const market = perpMarketAccounts.find(
      (m: any) => m.symbol === marketConfig.symbol,
    );

    if (!market) continue;

    const oracleInfo = oracleData[market.amm.oracle.toString()];
    const fundingRate = Number(market.amm.fundingRate) / 1e6; // Drift uses 1e6 precision

    rates.push({
      venue: Venue.DRIFT,
      marketSymbol: marketConfig.symbol,
      rate: fundingRate,
      intervalHours: FUNDING_INTERVAL_HOURS,
      fetchedAt: new Date(),
    });
  }

  await driftClient.unsubscribe();

  return rates;
}

/**
 * Fallback REST API-based fetching.
 * If the user provided DRIFT_API_URL, we attempt to hit it.
 * Otherwise returns empty array.
 */
async function fetchViaRest(): Promise<FundingRate[]> {
  if (!config.DRIFT_API_URL) {
    console.warn('[Drift] No DRIFT_API_URL configured, skipping REST fallback');
    return [];
  }

  const { default: axios } = await import('axios');

  const resp = await axios.get(`${config.DRIFT_API_URL}/markets`, {
    timeout: 10_000,
  });

  const markets = resp.data as Array<{
    symbol: string;
    fundingRate: number;
  }>;

  return markets
    .filter((m) => DRIFT_PERP_MARKETS.some((dpm) => dpm.symbol === m.symbol))
    .map((m) => ({
      venue: Venue.DRIFT,
      marketSymbol: m.symbol,
      rate: m.fundingRate,
      intervalHours: FUNDING_INTERVAL_HOURS,
      fetchedAt: new Date(),
    }));
}

/**
 * Get the earning side for a Drift funding rate.
 */
export function driftEarningSide(rate: number) {
  return earningSide(rate);
}

/**
 * Annualize a Drift funding rate.
 */
export function driftAnnualizedApr(rate: number): number {
  return annualizeFundingRate(rate, FUNDING_INTERVAL_HOURS);
}
