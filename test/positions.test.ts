import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closePaperPosition,
  computePnl,
  loadPositions,
  openPaperPosition,
  resolvePositionId,
  savePositions,
} from '../src/positions.js';
import { type FarmingOpportunity, type Position, Venue } from '../src/types.js';

const opp = (p: Partial<FarmingOpportunity> = {}): FarmingOpportunity => ({
  venue: Venue.HYPERLIQUID,
  marketSymbol: 'SOL-PERP',
  recommendedSide: 'short',
  annualizedApr: 0.876,
  rawRate: 0.0001,
  intervalHours: 1,
  markPrice: 100,
  ...p,
});

const pos = (id: string, p: Partial<Position> = {}): Position => ({
  id,
  venue: Venue.HYPERLIQUID,
  marketSymbol: 'SOL-PERP',
  side: 'long',
  sizeUsd: 1000,
  baseAmount: 10,
  entryPrice: 100,
  enteredApr: 0.876,
  enteredAt: '2026-11-03T00:00:00.000Z',
  ...p,
});

describe('computePnl', () => {
  const t0 = '2026-11-03T00:00:00.000Z';

  it('long gains when the price rises', () => {
    const pnl = computePnl(pos('a', { side: 'long', enteredAt: t0 }), 110, new Date(t0));
    expect(pnl.pricePnl).toBeCloseTo(100, 10); // 10 units x $10
    expect(pnl.estFundingPnl).toBe(0);
    expect(pnl.totalPnl).toBeCloseTo(100, 10);
  });

  it('short gains when the price falls and loses when it rises', () => {
    expect(computePnl(pos('a', { side: 'short', enteredAt: t0 }), 90, new Date(t0)).pricePnl).toBeCloseTo(100, 10);
    expect(computePnl(pos('a', { side: 'short', enteredAt: t0 }), 110, new Date(t0)).pricePnl).toBeCloseTo(-100, 10);
  });

  it('accrues estimated funding at the entry APR over the holding period', () => {
    // $1000 at 87.6% APR for 24h = 1000 * 0.876 / 365 = $2.40
    const pnl = computePnl(pos('a', { enteredAt: t0 }), 100, new Date('2026-11-04T00:00:00.000Z'));
    expect(pnl.hoursHeld).toBe(24);
    expect(pnl.estFundingPnl).toBeCloseTo(2.4, 10);
    expect(pnl.totalPnl).toBeCloseTo(2.4, 10);
  });
});

describe('resolvePositionId', () => {
  const positions = [pos('a1b2c3d4'), pos('a1ff0000'), pos('9e8d7c6b')];

  it('resolves a unique prefix', () => {
    const r = resolvePositionId(positions, '9e');
    expect(r.ok && r.position.id).toBe('9e8d7c6b');
  });

  it('resolves a full ID', () => {
    const r = resolvePositionId(positions, 'a1b2c3d4');
    expect(r.ok && r.position.id).toBe('a1b2c3d4');
  });

  it('prefers an exact match over longer IDs sharing the prefix', () => {
    const r = resolvePositionId([pos('abc'), pos('abcd')], 'abc');
    expect(r.ok && r.position.id).toBe('abc');
  });

  it('reports ambiguous prefixes with the candidate IDs', () => {
    const r = resolvePositionId(positions, 'a1');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/ambiguous/);
      expect(r.error).toContain('a1b2c3d4');
      expect(r.error).toContain('a1ff0000');
    }
  });

  it('reports when nothing matches, and rejects an empty prefix', () => {
    const none = resolvePositionId(positions, 'zz');
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error).toMatch(/No open position matches "zz"/);
    expect(resolvePositionId(positions, '  ').ok).toBe(false);
  });
});

describe('paper position store', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frf-test-'));
    file = path.join(dir, 'nested', 'positions.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('opens a position sized from the mark price', () => {
    const p = openPaperPosition(file, opp({ markPrice: 250 }), 1000, new Date('2026-11-03T00:00:00Z'));
    expect(p.id).toMatch(/^[0-9a-f]{8}$/);
    expect(p.baseAmount).toBe(4);
    expect(p.entryPrice).toBe(250);
    expect(p.side).toBe('short');
    expect(loadPositions(file)).toEqual([p]);
  });

  it('refuses to open without a valid price or size', () => {
    expect(() => openPaperPosition(file, opp({ markPrice: 0 }), 1000)).toThrow(/mark price/);
    expect(() => openPaperPosition(file, opp(), 0)).toThrow(/size/);
  });

  it('closes by unique prefix, returns PnL and removes only that position', () => {
    savePositions(file, [pos('aaaa1111', { side: 'short' }), pos('bbbb2222')]);
    const { position, pnl } = closePaperPosition(file, 'aaa', 95, new Date('2026-11-03T00:00:00Z'));
    expect(position.id).toBe('aaaa1111');
    expect(pnl.pricePnl).toBeCloseTo(50, 10); // short 10 units, price -$5
    expect(loadPositions(file).map((p) => p.id)).toEqual(['bbbb2222']);
  });

  it('does not modify the store on an ambiguous or unknown prefix', () => {
    savePositions(file, [pos('ab01'), pos('ab02')]);
    expect(() => closePaperPosition(file, 'ab', 100)).toThrow(/ambiguous/);
    expect(() => closePaperPosition(file, 'cd', 100)).toThrow(/No open position/);
    expect(loadPositions(file)).toHaveLength(2);
  });

  it('returns an empty list when the file does not exist', () => {
    expect(loadPositions(file)).toEqual([]);
  });
});
