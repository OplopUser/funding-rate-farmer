/**
 * Drift Protocol (v2) funding-rate fetcher.
 *
 * Reads Drift's perp market accounts directly from Solana over JSON-RPC
 * (read-only, no wallet): the market list and indices come from the SDK's
 * `MainnetPerpMarkets` metadata, account addresses are the program PDAs from
 * `getPerpMarketPublicKeySync`, and the raw account data is decoded with the
 * Drift IDL. The market symbol is taken from the on-chain `name` field
 * (`decodeName`); perp market accounts have no `symbol` property.
 *
 * Normalisation (per the Drift SDK's precision constants):
 *   amm.lastFundingRate        quote per base unit, FUNDING_RATE_PRECISION (1e9)
 *   amm.lastFundingOracleTwap  oracle TWAP at that funding update, PRICE_PRECISION (1e6)
 *   rate (fraction / period)   = (lastFundingRate / 1e9) / (lastFundingOracleTwap / 1e6)
 *   amm.fundingPeriod          seconds (3600 on mainnet)
 *   mark price                 amm.historicalOracleData.lastOraclePrice / 1e6
 *   open interest (base)       amm.baseAssetAmountLong / 1e9 (BASE_PRECISION)
 *
 * Positive lastFundingRate → longs pay shorts, the same convention as
 * Hyperliquid.
 *
 * Markets whose last funding update is older than `maxStalePeriods` funding
 * periods are reported as stale and excluded, so a paused venue cannot rank
 * at the top with an outdated rate.
 */

import { createRequire } from 'node:module';
import { type FundingRate, type VenueFetchResult, Venue } from '../types.js';

export const DRIFT_FUNDING_RATE_PRECISION = 1e9;
export const DRIFT_PRICE_PRECISION = 1e6;
export const DRIFT_BASE_PRECISION = 1e9;

/** Plain-number view of the perp market fields this module needs. */
export interface DriftPerpMarketFields {
  symbol: string;
  /** e.g. "active", "reduceOnly", "settlement", "delisted" */
  status: string;
  lastFundingRate: number;
  lastFundingOracleTwap: number;
  lastFundingRateTs: number; // unix seconds
  fundingPeriod: number; // seconds
  lastOraclePrice: number;
  baseAssetAmountLong: number;
}

const TRADABLE_STATUSES = new Set(['active', 'fundingPaused', 'ammPaused', 'fillPaused', 'withdrawPaused']);

/**
 * Normalise one decoded Drift perp market into a FundingRate.
 * Returns a reason string instead when the market should be skipped.
 */
export function normalizeDriftMarket(
  m: DriftPerpMarketFields,
  now: Date,
  maxStalePeriods = 3,
): FundingRate | { skip: 'inactive' | 'stale' | 'invalid' } {
  if (!TRADABLE_STATUSES.has(m.status)) return { skip: 'inactive' };
  if (!(m.lastFundingOracleTwap > 0) || !(m.fundingPeriod > 0) || !(m.lastOraclePrice > 0)) {
    return { skip: 'invalid' };
  }
  const ageSec = now.getTime() / 1000 - m.lastFundingRateTs;
  if (ageSec > maxStalePeriods * m.fundingPeriod) return { skip: 'stale' };

  const rate =
    m.lastFundingRate /
    DRIFT_FUNDING_RATE_PRECISION /
    (m.lastFundingOracleTwap / DRIFT_PRICE_PRECISION);
  const markPrice = m.lastOraclePrice / DRIFT_PRICE_PRECISION;

  return {
    venue: Venue.DRIFT,
    marketSymbol: m.symbol,
    rate,
    intervalHours: m.fundingPeriod / 3600,
    markPrice,
    openInterestUsd: (m.baseAssetAmountLong / DRIFT_BASE_PRECISION) * markPrice,
    updatedAt: new Date(m.lastFundingRateTs * 1000),
    fetchedAt: now,
  };
}

export interface DriftFetchOptions {
  rpcUrl?: string;
  /** Include markets with stale funding data (used for price lookups). */
  includeStale?: boolean;
  maxStalePeriods?: number;
}

/**
 * Fetch funding rates for all Drift mainnet perp markets known to the SDK.
 */
export async function fetchDriftFundingRates(
  opts: DriftFetchOptions = {},
): Promise<VenueFetchResult> {
  const rpcUrl = opts.rpcUrl ?? 'https://api.mainnet-beta.solana.com';
  const maxStalePeriods = opts.includeStale ? Infinity : (opts.maxStalePeriods ?? 3);

  const [{ Connection, PublicKey }, sdk, { BorshAccountsCoder }] = await Promise.all([
    import('@solana/web3.js'),
    import('@drift-labs/sdk'),
    import('@coral-xyz/anchor'),
  ]);
  const require = createRequire(import.meta.url);
  const idl = require('@drift-labs/sdk/lib/node/idl/drift.json');
  const coder = new BorshAccountsCoder(idl);

  const connection = new Connection(rpcUrl, 'confirmed');
  const programId = new PublicKey(sdk.DRIFT_PROGRAM_ID);
  const marketConfigs = sdk.MainnetPerpMarkets;
  const keys = marketConfigs.map((c) => sdk.getPerpMarketPublicKeySync(programId, c.marketIndex));

  // getMultipleAccounts accepts at most 100 keys per request.
  const infos = [];
  for (let i = 0; i < keys.length; i += 100) {
    infos.push(...(await connection.getMultipleAccountsInfo(keys.slice(i, i + 100))));
  }

  const now = new Date();
  const rates: FundingRate[] = [];
  const skipped = { inactive: 0, stale: 0, invalid: 0, missing: 0 };
  let newestStaleTs = 0;

  for (const info of infos) {
    if (!info) {
      skipped.missing++;
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const market = coder.decode('PerpMarket', info.data) as any;
    const amm = market.amm;
    const fields: DriftPerpMarketFields = {
      symbol: sdk.decodeName(market.name),
      status: Object.keys(market.status)[0] ?? 'unknown',
      lastFundingRate: Number(amm.lastFundingRate.toString()),
      lastFundingOracleTwap: Number(amm.lastFundingOracleTwap.toString()),
      lastFundingRateTs: Number(amm.lastFundingRateTs.toString()),
      fundingPeriod: Number(amm.fundingPeriod.toString()),
      lastOraclePrice: Number(amm.historicalOracleData.lastOraclePrice.toString()),
      baseAssetAmountLong: Number(amm.baseAssetAmountLong.toString()),
    };
    const result = normalizeDriftMarket(fields, now, maxStalePeriods);
    if ('skip' in result) {
      skipped[result.skip]++;
      if (result.skip === 'stale') {
        newestStaleTs = Math.max(newestStaleTs, fields.lastFundingRateTs);
      }
    } else {
      rates.push(result);
    }
  }

  const warnings: string[] = [];
  if (skipped.stale > 0) {
    warnings.push(
      `skipped ${skipped.stale} markets with stale funding data ` +
        `(newest update ${new Date(newestStaleTs * 1000).toISOString()})`,
    );
  }
  if (skipped.inactive > 0) warnings.push(`skipped ${skipped.inactive} inactive/delisted markets`);
  if (skipped.missing > 0) warnings.push(`${skipped.missing} market accounts not found on-chain`);
  if (skipped.invalid > 0) warnings.push(`skipped ${skipped.invalid} markets with missing price data`);

  return { venue: Venue.DRIFT, rates, warnings };
}
