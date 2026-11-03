import { describe, expect, it } from 'vitest';
import { rankOpportunities, rateToOpportunity } from '../src/ranking.js';
import { type FundingRate, Venue } from '../src/types.js';

const at = new Date('2026-11-03T00:00:00Z');
const rate = (p: Partial<FundingRate> & Pick<FundingRate, 'marketSymbol' | 'rate'>): FundingRate => ({
  venue: Venue.HYPERLIQUID,
  intervalHours: 1,
  markPrice: 100,
  openInterestUsd: 1_000_000,
  fetchedAt: at,
  ...p,
});

describe('rateToOpportunity', () => {
  it('recommends short with positive APR for a positive rate', () => {
    const o = rateToOpportunity(rate({ marketSymbol: 'A-PERP', rate: 0.0001 }));
    expect(o.recommendedSide).toBe('short');
    expect(o.annualizedApr).toBeCloseTo(0.876, 12);
    expect(o.rawRate).toBe(0.0001);
  });

  it('recommends long with positive APR for a negative rate', () => {
    const o = rateToOpportunity(rate({ marketSymbol: 'B-PERP', rate: -0.0002 }));
    expect(o.recommendedSide).toBe('long');
    expect(o.annualizedApr).toBeCloseTo(1.752, 12);
  });

  it('carries the mark price through', () => {
    expect(rateToOpportunity(rate({ marketSymbol: 'C', rate: 0.0001, markPrice: 42 })).markPrice).toBe(42);
  });
});

describe('rankOpportunities', () => {
  const rates = [
    rate({ marketSymbol: 'LOW-PERP', rate: 0.00001 }), // 8.76%
    rate({ marketSymbol: 'NEG-PERP', rate: -0.0003 }), // 262.8% long
    rate({ marketSymbol: 'MID-PERP', rate: 0.0001 }), // 87.6% short
    rate({ marketSymbol: 'ZERO-PERP', rate: 0 }),
    rate({ marketSymbol: 'DUST-PERP', rate: 0.001, openInterestUsd: 5_000 }), // 876% but tiny OI
    rate({ venue: Venue.DRIFT, marketSymbol: 'D8H-PERP', rate: 0.0008, intervalHours: 8 }), // 87.6%
  ];

  it('sorts by APR descending regardless of sign or interval', () => {
    const ranked = rankOpportunities(rates);
    expect(ranked.map((o) => o.marketSymbol)).toEqual([
      'DUST-PERP',
      'NEG-PERP',
      'D8H-PERP',
      'MID-PERP',
      'LOW-PERP',
    ]);
  });

  it('drops zero-rate markets', () => {
    expect(rankOpportunities(rates).some((o) => o.marketSymbol === 'ZERO-PERP')).toBe(false);
  });

  it('applies the minimum APR (percent) filter inclusively', () => {
    const ranked = rankOpportunities(rates, { minAprPercent: 87.6 });
    expect(ranked.map((o) => o.marketSymbol)).not.toContain('LOW-PERP');
    expect(ranked.map((o) => o.marketSymbol)).toContain('MID-PERP');
  });

  it('applies the minimum open interest filter but keeps markets without OI data', () => {
    const withUnknown = [...rates, rate({ marketSymbol: 'NOOI-PERP', rate: 0.0001, openInterestUsd: undefined })];
    const ranked = rankOpportunities(withUnknown, { minOpenInterestUsd: 100_000 });
    const symbols = ranked.map((o) => o.marketSymbol);
    expect(symbols).not.toContain('DUST-PERP');
    expect(symbols).toContain('NOOI-PERP');
  });

  it('breaks APR ties by larger open interest', () => {
    const ranked = rankOpportunities([
      rate({ marketSymbol: 'SMALL', rate: 0.0001, openInterestUsd: 1e6 }),
      rate({ marketSymbol: 'BIG', rate: 0.0001, openInterestUsd: 5e6 }),
    ]);
    expect(ranked.map((o) => o.marketSymbol)).toEqual(['BIG', 'SMALL']);
  });
});
