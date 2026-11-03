/**
 * Paper position store and PnL maths.
 *
 * Positions are local JSON records only; nothing here signs or sends a
 * transaction. The store is a single JSON array of open positions.
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HOURS_PER_YEAR } from './apr.js';
import type { FarmingOpportunity, PnlBreakdown, Position } from './types.js';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export function loadPositions(file: string): Position[] {
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
  if (!Array.isArray(data)) throw new Error(`${file} does not contain a JSON array`);
  return data as Position[];
}

export function savePositions(file: string, positions: Position[]): void {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(positions, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function newId(existing: Position[]): string {
  for (;;) {
    const id = randomBytes(4).toString('hex');
    if (!existing.some((p) => p.id === id)) return id;
  }
}

// ---------------------------------------------------------------------------
// ID prefix resolution
// ---------------------------------------------------------------------------

export type ResolveResult =
  | { ok: true; position: Position }
  | { ok: false; error: string };

/**
 * Find the single position whose ID starts with `prefix`.
 * An exact ID match always wins, so a full ID is never ambiguous.
 */
export function resolvePositionId(positions: Position[], prefix: string): ResolveResult {
  const needle = prefix.trim();
  if (!needle) return { ok: false, error: 'Position ID prefix must not be empty.' };

  const exact = positions.find((p) => p.id === needle);
  if (exact) return { ok: true, position: exact };

  const matches = positions.filter((p) => p.id.startsWith(needle));
  if (matches.length === 1) return { ok: true, position: matches[0] };
  if (matches.length === 0) {
    return { ok: false, error: `No open position matches "${needle}".` };
  }
  const ids = matches.map((p) => p.id).join(', ');
  return {
    ok: false,
    error: `"${needle}" is ambiguous: it matches ${matches.length} positions (${ids}). Use a longer prefix.`,
  };
}

// ---------------------------------------------------------------------------
// PnL
// ---------------------------------------------------------------------------

/**
 * Paper PnL at `markPrice`.
 *
 *   price PnL   = direction × baseAmount × (markPrice − entryPrice)
 *                 (direction = +1 long, −1 short)
 *   est funding = sizeUsd × enteredApr × hoursHeld / 8760
 *
 * The funding term assumes the entry rate held for the whole period, which
 * is only an estimate: real funding changes every interval and can flip sign.
 */
export function computePnl(position: Position, markPrice: number, now: Date = new Date()): PnlBreakdown {
  const direction = position.side === 'long' ? 1 : -1;
  const pricePnl = direction * position.baseAmount * (markPrice - position.entryPrice);
  const hoursHeld = Math.max(0, (now.getTime() - Date.parse(position.enteredAt)) / 3_600_000);
  const estFundingPnl = position.sizeUsd * position.enteredApr * (hoursHeld / HOURS_PER_YEAR);
  return {
    markPrice,
    pricePnl,
    estFundingPnl,
    totalPnl: pricePnl + estFundingPnl,
    hoursHeld,
  };
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

/**
 * Record a paper position in `opportunity` at its scanned mark price.
 */
export function openPaperPosition(
  file: string,
  opportunity: FarmingOpportunity,
  sizeUsd: number,
  now: Date = new Date(),
): Position {
  if (!(sizeUsd > 0)) throw new Error(`Position size must be positive, got ${sizeUsd}`);
  if (!(opportunity.markPrice > 0)) {
    throw new Error(`No valid mark price for ${opportunity.venue} ${opportunity.marketSymbol}`);
  }
  const positions = loadPositions(file);
  const position: Position = {
    id: newId(positions),
    venue: opportunity.venue,
    marketSymbol: opportunity.marketSymbol,
    side: opportunity.recommendedSide,
    sizeUsd,
    baseAmount: sizeUsd / opportunity.markPrice,
    entryPrice: opportunity.markPrice,
    enteredApr: opportunity.annualizedApr,
    enteredAt: now.toISOString(),
  };
  positions.push(position);
  savePositions(file, positions);
  return position;
}

/**
 * Remove the position identified by `idPrefix` and return it with its final
 * PnL at `exitPrice`. Throws with a clear message if the prefix matches no
 * position or more than one.
 */
export function closePaperPosition(
  file: string,
  idPrefix: string,
  exitPrice: number,
  now: Date = new Date(),
): { position: Position; pnl: PnlBreakdown } {
  const positions = loadPositions(file);
  const resolved = resolvePositionId(positions, idPrefix);
  if (!resolved.ok) throw new Error(resolved.error);
  const position = resolved.position;
  const pnl = computePnl(position, exitPrice, now);
  savePositions(file, positions.filter((p) => p.id !== position.id));
  return { position, pnl };
}
