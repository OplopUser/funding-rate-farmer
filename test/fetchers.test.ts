import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeDriftMarket, type DriftPerpMarketFields } from '../src/fetchers/drift.js';
import { parseHyperliquidMetaAndAssetCtxs } from '../src/fetchers/hyperliquid.js';
import { Venue } from '../src/types.js';

const hlFixture = JSON.parse(
  readFileSync(new URL('./fixtures/hyperliquid-metaAndAssetCtxs.json', import.meta.url), 'utf-8'),
);

describe('Hyperliquid metaAndAssetCtxs parsing (live response fixture)', () => {
  const fetchedAt = new Date('2026-11-03T12:00:00Z');
  const { rates, warnings } = parseHyperliquidMetaAndAssetCtxs(hlFixture, fetchedAt);

  it('pairs universe entries with asset contexts by index and skips delisted markets', () => {
    expect(rates.map((r) => r.marketSymbol)).toEqual(['BTC-PERP', 'ETH-PERP', 'SOL-PERP']);
    expect(warnings).toContain('skipped 1 delisted markets');
  });

  it('uses the hourly funding fraction, markPx and OI in USD', () => {
    const btc = rates[0];
    expect(btc.venue).toBe(Venue.HYPERLIQUID);
    expect(btc.rate).toBe(Number(hlFixture[1][0].funding));
    expect(btc.intervalHours).toBe(1);
    expect(btc.markPrice).toBe(Number(hlFixture[1][0].markPx));
    expect(btc.openInterestUsd).toBeCloseTo(
      Number(hlFixture[1][0].openInterest) * Number(hlFixture[1][0].markPx),
      6,
    );
    expect(btc.fetchedAt).toBe(fetchedAt);
  });

  it('keeps negative rates negative', () => {
    const res = parseHyperliquidMetaAndAssetCtxs([
      { universe: [{ name: 'XYZ' }] },
      [{ funding: '-0.0002', markPx: '2.5', openInterest: '10' }],
    ]);
    expect(res.rates[0].rate).toBe(-0.0002);
    expect(res.rates[0].openInterestUsd).toBe(25);
  });

  it('skips markets with no funding or price', () => {
    const res = parseHyperliquidMetaAndAssetCtxs([
      { universe: [{ name: 'A' }, { name: 'B' }] },
      [{ funding: null, markPx: '1' }, { funding: '0.0001', markPx: null, oraclePx: null }],
    ]);
    expect(res.rates).toHaveLength(0);
  });

  it('rejects malformed responses', () => {
    expect(() => parseHyperliquidMetaAndAssetCtxs({})).toThrow(/expected \[meta, assetCtxs\]/);
    expect(() => parseHyperliquidMetaAndAssetCtxs([{}, []])).toThrow(/missing universe/);
  });
});

describe('Drift perp market normalisation', () => {
  // Real SOL-PERP values read on-chain (market index 0).
  const lastTs = Date.parse('2026-04-01T18:00:00Z') / 1000;
  const sol: DriftPerpMarketFields = {
    symbol: 'SOL-PERP',
    status: 'active',
    lastFundingRate: -1_024_958, // quote/base, 1e9 precision
    lastFundingOracleTwap: 84_693_889, // $84.693889, 1e6 precision
    lastFundingRateTs: lastTs,
    fundingPeriod: 3600,
    lastOraclePrice: 83_945_230,
    baseAssetAmountLong: 2_000_000_000_000, // 2000 SOL, 1e9 precision
  };
  const fresh = new Date((lastTs + 1800) * 1000);

  it('converts lastFundingRate to a fraction of the oracle TWAP', () => {
    const r = normalizeDriftMarket(sol, fresh);
    if ('skip' in r) throw new Error(`unexpected skip: ${r.skip}`);
    expect(r.rate).toBeCloseTo(-1_024_958 / 1e9 / 84.693889, 15);
    expect(r.rate).toBeLessThan(0); // negative: shorts pay longs
    expect(r.intervalHours).toBe(1);
    expect(r.markPrice).toBeCloseTo(83.94523, 9);
    expect(r.openInterestUsd).toBeCloseTo(2000 * 83.94523, 6);
    expect(r.updatedAt?.toISOString()).toBe('2026-04-01T18:00:00.000Z');
  });

  it('derives the interval from fundingPeriod', () => {
    const r = normalizeDriftMarket({ ...sol, fundingPeriod: 8 * 3600 }, fresh);
    if ('skip' in r) throw new Error('unexpected skip');
    expect(r.intervalHours).toBe(8);
  });

  it('skips markets whose funding is older than maxStalePeriods periods', () => {
    const later = new Date((lastTs + 3 * 3600 + 1) * 1000);
    expect(normalizeDriftMarket(sol, later)).toEqual({ skip: 'stale' });
    expect('skip' in normalizeDriftMarket(sol, later, Infinity)).toBe(false);
  });

  it('skips inactive markets and markets without prices', () => {
    expect(normalizeDriftMarket({ ...sol, status: 'delisted' }, fresh)).toEqual({ skip: 'inactive' });
    expect(normalizeDriftMarket({ ...sol, status: 'reduceOnly' }, fresh)).toEqual({ skip: 'inactive' });
    expect(normalizeDriftMarket({ ...sol, lastFundingOracleTwap: 0 }, fresh)).toEqual({ skip: 'invalid' });
  });
});
