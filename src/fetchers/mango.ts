/**
 * Mango Markets funding rate fetcher.
 *
 * Mango Markets is a Solana-based perp DEX. Funding is calculated
 * every 1 hour (Mango v4 uses perp market accounts with a
 * `fundingRate` field).
 *
 * Integration approach:
 *   Primary: Mango public REST API at https://api.mango.markets/v3/perp-markets
 *   Fallback: @blockworks-foundation/mango-client SDK
 *
 * The REST API returns perp market data including fundingRate.
 * SDK-based approach reads longFunding/shortFunding from PerpMarket on-chain.
 */

import { type FundingRate, Venue } from '../types.js';
import { config } from '../config.js';
import { annualizeFundingRate, earningSide } from '../apr.js';

const FUNDING_INTERVAL_HOURS = 1;

const MANGO_MARKETS: Array<{ symbol: string; baseAsset: string }> = [
  { symbol: 'SOL-PERP', baseAsset: 'SOL' },
  { symbol: 'BTC-PERP', baseAsset: 'BTC' },
  { symbol: 'ETH-PERP', baseAsset: 'ETH' },
  { symbol: 'MNGO-PERP', baseAsset: 'MNGO' },
  { symbol: 'SRM-PERP', baseAsset: 'SRM' },
  { symbol: 'RAY-PERP', baseAsset: 'RAY' },
  { symbol: 'FTT-PERP', baseAsset: 'FTT' },
  { symbol: 'ADA-PERP', baseAsset: 'ADA' },
  { symbol: 'AVAX-PERP', baseAsset: 'AVAX' },
];

/**
 * Fetch funding rates from Mango Markets.
 */
export async function fetchMangoFundingRates(): Promise<FundingRate[]> {
  try {
    return await fetchViaRest();
  } catch (restErr) {
    console.warn(
      '[Mango] REST API fetch failed, falling back to SDK:',
      (restErr as Error).message,
    );
    return await fetchViaSdk();
  }
}

/**
 * Primary: Mango public REST API.
 * Returns perp market data including funding rates.
 */
async function fetchViaRest(): Promise<FundingRate[]> {
  const { default: axios } = await import('axios');

  const resp = await axios.get('https://api.mango.markets/v3/perp-markets', {
    timeout: 10_000,
  });

  const rawMarkets = resp.data as Array<{
    name: string;
    fundingRate: number;
  }>;

  const normalizedSymbols = new Set(MANGO_MARKETS.map((m) => m.symbol));

  return rawMarkets
    .filter((m) => normalizedSymbols.has(m.name))
    .map((m) => ({
      venue: Venue.MANGO,
      marketSymbol: m.name,
      rate: m.fundingRate ?? 0,
      intervalHours: FUNDING_INTERVAL_HOURS,
      fetchedAt: new Date(),
    }));
}

/**
 * Fallback: @blockworks-foundation/mango-client SDK.
 *
 * Connects to the Mango v4 program and reads perp market states.
 * Mango v4's PerpMarket has longFunding and shortFunding fields that
 * can be used to derive the current funding rate.
 */
async function fetchViaSdk(): Promise<FundingRate[]> {
  try {
    const mangoExports = await import('@blockworks-foundation/mango-client');
    const { Connection, PublicKey } = await import('@solana/web3.js');

    const connection = new Connection(config.HELIOS_RPC_URL, 'confirmed');
    const client = new mangoExports.MangoClient(
      connection,
      new PublicKey('mv3ekLzLxVPN7wgrPm5jLkECwHENRgsK2tvCn82Xx5c'),
    );

    const groupPk = new PublicKey('7pA1BvL5yLAdKzf5k68f4zTbGXGJWZ9sT9y7GmWxS');
    const group = await client.getMangoGroup(groupPk);

    const rates: FundingRate[] = [];

    // Iterate perp markets using the PerpMarketInfo entries
    for (let i = 0; i < group.perpMarkets.length; i++) {
      const marketInfo = group.perpMarkets[i];
      if (!marketInfo || marketInfo.isEmpty?.()) continue;

      try {
        // Load the full PerpMarket data for this market
        // getPerpMarket requires: marketPk, baseDecimals, quoteDecimals
        const perpMarket = await client.getPerpMarket(
          marketInfo.perpMarket,
          6,
          6,
        );

        if (!perpMarket) continue;

        // In Mango v4, funding rate is derived from longFunding/shortFunding
        // The effective funding rate = (longFunding - shortFunding) / interval
        const longFunding = Number(perpMarket.longFunding) || 0;
        const shortFunding = Number(perpMarket.shortFunding) || 0;
        const fundingRate = longFunding - shortFunding;

        const symbol = `PERP_${i}`;

        rates.push({
          venue: Venue.MANGO,
          marketSymbol: symbol,
          rate: fundingRate,
          intervalHours: FUNDING_INTERVAL_HOURS,
          fetchedAt: new Date(),
        });
      } catch {
        // Skip markets that fail to load
      }
    }

    return rates;
  } catch (sdkErr) {
    console.warn('[Mango] SDK fetch also failed:', (sdkErr as Error).message);
    return [];
  }
}

/**
 * Get the earning side for a Mango funding rate.
 */
export function mangoEarningSide(rate: number) {
  return earningSide(rate);
}

/**
 * Annualize a Mango funding rate.
 */
export function mangoAnnualizedApr(rate: number): number {
  return annualizeFundingRate(rate, FUNDING_INTERVAL_HOURS);
}
