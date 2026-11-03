import { describe, expect, it } from 'vitest';
import { annualizeFundingRate, earningSide, formatApr, formatRate } from '../src/apr.js';

describe('annualizeFundingRate', () => {
  it('annualises an hourly rate as rate x 24 x 365', () => {
    expect(annualizeFundingRate(0.0001, 1)).toBeCloseTo(0.876, 12); // 0.01%/h = 87.6% APR
  });

  it('annualises an 8h rate as rate x 3 x 365', () => {
    expect(annualizeFundingRate(0.0001, 8)).toBeCloseTo(0.1095, 12);
  });

  it('gives the same APR for equivalent hourly and 8h rates', () => {
    expect(annualizeFundingRate(0.0008, 8)).toBeCloseTo(annualizeFundingRate(0.0001, 1), 12);
  });

  it('preserves the sign of the rate', () => {
    expect(annualizeFundingRate(-0.00005, 1)).toBeCloseTo(-0.438, 12);
    expect(annualizeFundingRate(0, 1)).toBe(0);
  });

  it('rejects non-positive intervals', () => {
    expect(() => annualizeFundingRate(0.0001, 0)).toThrow(RangeError);
    expect(() => annualizeFundingRate(0.0001, -1)).toThrow(RangeError);
  });
});

describe('earningSide (positive rate = longs pay shorts)', () => {
  it('shorts earn when the rate is positive', () => {
    expect(earningSide(0.0001)).toBe('short');
  });
  it('longs earn when the rate is negative', () => {
    expect(earningSide(-0.0001)).toBe('long');
  });
  it('maps zero to long by convention', () => {
    expect(earningSide(0)).toBe('long');
  });
});

describe('formatting', () => {
  it('formats APR and raw rates as percentages', () => {
    expect(formatApr(0.1234)).toBe('+12.34%');
    expect(formatApr(-0.05)).toBe('-5.00%');
    expect(formatRate(0.0000125)).toBe('0.0013%');
  });
});
