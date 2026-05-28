/**
 * Position manager.
 *
 * Tracks open positions across all venues. In SIMULATION_ONLY mode
 * (default), positions are paper-only with no real capital risk.
 *
 * Supports:
 *   - Opening simulated positions
 *   - Closing positions
 *   - Listing current positions
 *   - Calculating unrealized PnL
 */

import { type Position, type PositionSide, type FarmingOpportunity, Venue } from './types.js';
import { config } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

const POSITIONS_FILE = path.resolve('data', 'positions.json');

interface StoredPosition {
  id: string;
  venue: Venue;
  marketSymbol: string;
  side: PositionSide;
  sizeUsd: number;
  entryPrice: number;
  enteredApr: number;
  enteredAt: string;
}

/**
 * Load positions from disk.
 */
function loadPositions(): StoredPosition[] {
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      const data = fs.readFileSync(POSITIONS_FILE, 'utf-8');
      return JSON.parse(data) as StoredPosition[];
    }
  } catch (err) {
    console.warn('[Positions] Failed to load positions file:', (err as Error).message);
  }
  return [];
}

/**
 * Save positions to disk.
 */
function savePositions(positions: StoredPosition[]): void {
  try {
    const dir = path.dirname(POSITIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
  } catch (err) {
    console.error('[Positions] Failed to save positions:', (err as Error).message);
  }
}

/**
 * Generate a unique position ID.
 */
function generateId(): string {
  return `pos_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Open a new position (paper/simulated).
 *
 * In SIMULATION_ONLY mode, this just records the position locally.
 * In live mode (SIMULATION_ONLY=false), this would execute real
 * transactions on the venue.
 *
 * @param opportunity - The farming opportunity to enter
 * @param sizeUsd     - Position size in USD
 * @param entryPrice  - Current market price
 */
export async function openPosition(
  opportunity: FarmingOpportunity,
  sizeUsd: number,
  entryPrice: number,
): Promise<Position> {
  if (config.SIMULATION_ONLY) {
    console.log(`🧪 [SIMULATION] Opening ${opportunity.recommendedSide} position on ${opportunity.venue}`);
    console.log(`   Market:  ${opportunity.marketSymbol}`);
    console.log(`   Size:    $${sizeUsd.toLocaleString()}`);
    console.log(`   APR:     ${(opportunity.annualizedApr * 100).toFixed(2)}%`);
    console.log(`   Price:   $${entryPrice}`);
  } else {
    console.log(`🚀 [LIVE] Opening ${opportunity.recommendedSide} position on ${opportunity.venue}`);
    // TODO: Implement real order execution per venue
    console.log('   Live execution not yet implemented — falling back to simulation.');
  }

  const position: StoredPosition = {
    id: generateId(),
    venue: opportunity.venue,
    marketSymbol: opportunity.marketSymbol,
    side: opportunity.recommendedSide,
    sizeUsd,
    entryPrice,
    enteredApr: opportunity.annualizedApr,
    enteredAt: new Date().toISOString(),
  };

  const positions = loadPositions();
  positions.push(position);
  savePositions(positions);

  return storedToPosition(position);
}

/**
 * Close an existing position.
 *
 * @param positionId - ID of the position to close
 */
export async function closePosition(positionId: string): Promise<Position | null> {
  const positions = loadPositions();
  const idx = positions.findIndex((p) => p.id === positionId);

  if (idx === -1) {
    console.error(`❌ Position not found: ${positionId}`);
    return null;
  }

  const [removed] = positions.splice(idx, 1);
  savePositions(positions);

  const pos = storedToPosition(removed);

  if (config.SIMULATION_ONLY) {
    console.log(`🧪 [SIMULATION] Closed ${pos.side} position on ${pos.venue}/${pos.marketSymbol}`);
    console.log(`   Entry: $${pos.entryPrice} | PnL: $${pos.unrealizedPnl?.toFixed(2) ?? 'N/A'}`);
  } else {
    console.log(`🚀 [LIVE] Closed ${pos.side} position on ${pos.venue}/${pos.marketSymbol}`);
  }

  return pos;
}

/**
 * Get all open positions.
 */
export function getPositions(): Position[] {
  return loadPositions().map(storedToPosition);
}

/**
 * Get a single position by ID.
 */
export function getPosition(positionId: string): Position | null {
  const positions = loadPositions();
  const stored = positions.find((p) => p.id === positionId);
  return stored ? storedToPosition(stored) : null;
}

/**
 * Convert a stored position to a full Position object.
 */
function storedToPosition(stored: StoredPosition): Position {
  return {
    id: stored.id,
    venue: stored.venue,
    marketSymbol: stored.marketSymbol,
    side: stored.side,
    sizeUsd: stored.sizeUsd,
    entryPrice: stored.entryPrice,
    enteredApr: stored.enteredApr,
    enteredAt: new Date(stored.enteredAt),
  };
}

/**
 * Display positions in a formatted way.
 */
export function displayPositions(): void {
  const positions = getPositions();

  if (positions.length === 0) {
    console.log('📭 No open positions.');
    return;
  }

  console.log(`📊 OPEN POSITIONS (${positions.length})\n`);
  console.log('ID        Venue        Market        Side   Size      Entry Price  APR');
  console.log('─'.repeat(80));

  for (const pos of positions) {
    const idStr = pos.id.substring(0, 8).padEnd(9, ' ');
    const venueStr = pos.venue.padEnd(12, ' ');
    const marketStr = pos.marketSymbol.padEnd(13, ' ');
    const sideStr = pos.side.padEnd(6, ' ');
    const sizeStr = `$${pos.sizeUsd.toLocaleString()}`.padEnd(10, ' ');
    const priceStr = `$${pos.entryPrice.toFixed(4)}`.padEnd(12, ' ');
    const aprStr = `${(pos.enteredApr * 100).toFixed(2)}%`;

    console.log(`${idStr}${venueStr}${marketStr}${sideStr}${sizeStr}${priceStr}${aprStr}`);
  }
  console.log('');
}
