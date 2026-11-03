/**
 * Console table formatting for the CLI.
 */

import chalk from 'chalk';
import { formatRate } from './apr.js';
import type { VenueReport } from './scanner.js';
import type { FarmingOpportunity, PnlBreakdown, Position } from './types.js';

export function formatUsd(n: number, digits = 2): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** Price with enough significant digits for both BTC and sub-cent tokens. */
export function formatPrice(n: number): string {
  if (n >= 1000) return formatUsd(n, 2);
  if (n >= 1) return formatUsd(n, 4);
  return `$${n.toPrecision(4)}`;
}

export function formatCompactUsd(n: number | undefined): string {
  if (n === undefined) return 'n/a';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function colorPnl(n: number): string {
  const s = formatUsd(n);
  return n > 0 ? chalk.green(s) : n < 0 ? chalk.red(s) : s;
}

export function printVenueReports(reports: VenueReport[]): void {
  for (const r of reports) {
    if (r.error) {
      console.log(chalk.red(`  ${r.venue.padEnd(12)} failed: ${r.error}`));
      continue;
    }
    console.log(`  ${r.venue.padEnd(12)} ${r.count} markets`);
    for (const w of r.warnings) console.log(chalk.yellow(`  ${''.padEnd(12)} note: ${w}`));
  }
  console.log('');
}

export function printOpportunities(opps: FarmingOpportunity[], limit: number): void {
  if (opps.length === 0) {
    console.log('No opportunities match the filters.\n');
    return;
  }
  const shown = opps.slice(0, limit);
  const header =
    'Rank  Venue        Market          Side   APR (earned)  Rate/interval   Mark price     Open interest';
  console.log(chalk.bold(header));
  console.log('-'.repeat(header.length));
  shown.forEach((o, i) => {
    console.log(
      [
        String(i + 1).padStart(4),
        '  ',
        o.venue.padEnd(13),
        o.marketSymbol.padEnd(16),
        (o.recommendedSide === 'short' ? chalk.magenta : chalk.cyan)(o.recommendedSide.padEnd(7)),
        `${(o.annualizedApr * 100).toFixed(2)}%`.padStart(12),
        '  ',
        `${formatRate(o.rawRate)}/${o.intervalHours}h`.padStart(14),
        '  ',
        formatPrice(o.markPrice).padStart(13),
        '  ',
        formatCompactUsd(o.openInterestUsd).padStart(13),
      ].join(''),
    );
  });
  if (opps.length > shown.length) {
    console.log(chalk.dim(`... ${opps.length - shown.length} more (use --limit to show more)`));
  }
  console.log('');
}

export function printPosition(p: Position): void {
  console.log(`  ID:        ${p.id}`);
  console.log(`  Market:    ${p.venue} ${p.marketSymbol}`);
  console.log(`  Side:      ${p.side} (receives funding at entry)`);
  console.log(`  Size:      ${formatUsd(p.sizeUsd)} = ${p.baseAmount.toLocaleString('en-US', { maximumSignificantDigits: 6 })} base units`);
  console.log(`  Entry:     ${formatPrice(p.entryPrice)} at ${p.enteredAt}`);
  console.log(`  Entry APR: ${(p.enteredApr * 100).toFixed(2)}%`);
}

export function printPnl(pnl: PnlBreakdown): void {
  console.log(`  Mark:      ${formatPrice(pnl.markPrice)}`);
  console.log(`  Held:      ${pnl.hoursHeld.toFixed(2)} h`);
  console.log(`  Price PnL: ${colorPnl(pnl.pricePnl)}`);
  console.log(`  Est. funding (entry APR held constant): ${colorPnl(pnl.estFundingPnl)}`);
  console.log(`  Total:     ${colorPnl(pnl.totalPnl)}`);
}

export function printPositionsTable(
  rows: Array<{ position: Position; pnl?: PnlBreakdown; error?: string }>,
): void {
  if (rows.length === 0) {
    console.log('No open paper positions.\n');
    return;
  }
  const header =
    'ID        Venue        Market          Side   Size         Entry          Mark           Price PnL    Est. funding';
  console.log(chalk.bold(header));
  console.log('-'.repeat(header.length));
  for (const { position: p, pnl, error } of rows) {
    const cells = [
      p.id.padEnd(10),
      p.venue.padEnd(13),
      p.marketSymbol.padEnd(16),
      p.side.padEnd(7),
      formatUsd(p.sizeUsd).padEnd(13),
      formatPrice(p.entryPrice).padEnd(15),
    ];
    if (pnl) {
      cells.push(
        formatPrice(pnl.markPrice).padEnd(15),
        colorPnl(pnl.pricePnl) + ' '.repeat(Math.max(1, 13 - formatUsd(pnl.pricePnl).length)),
        colorPnl(pnl.estFundingPnl),
      );
    } else {
      cells.push(chalk.yellow(`price unavailable${error ? `: ${error}` : ''}`));
    }
    console.log(cells.join(''));
  }
  console.log('');
}
