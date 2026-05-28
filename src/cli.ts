#!/usr/bin/env node

/**
 * Funding Rate Farmer — CLI runner.
 *
 * Commands:
 *   scan   - Scan all venues and show top funding rate opportunities
 *   farm   - Enter the best available position
 *   status - Show current positions
 *   close  - Close a specific position
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { scanOpportunities, displayOpportunities } from './scanner.js';
import { openPosition, closePosition, displayPositions, getPositions } from './positions.js';
import { config } from './config.js';
import { type FarmingOpportunity } from './types.js';

const program = new Command();

program
  .name('funding-rate-farmer')
  .description('Multi-venue funding rate farming bot (Drift, Zeta, Mango, Hyperliquid)')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan all venues and show top funding rate opportunities')
  .option('-m, --min-apr <percent>', 'Minimum APR percentage filter', String(config.MIN_APR_PERCENT))
  .action(async (options: { minApr: string }) => {
    console.log(chalk.bold.cyan('\n═══ FUNDING RATE FARMER ═══\n'));
    console.log(`Simulation mode: ${config.SIMULATION_ONLY ? chalk.green('ON') : chalk.red('OFF')}\n`);

    const minApr = parseFloat(options.minApr) || config.MIN_APR_PERCENT;
    const opportunities = await scanOpportunities(minApr);
    displayOpportunities(opportunities);

    if (opportunities.length > 0) {
      console.log(chalk.dim('Tip: Use "funding-rate-farmer farm" to enter the best position.'));
    }
  });

program
  .command('farm')
  .description('Enter the best available funding rate farming position')
  .option('-s, --size <usd>', 'Position size in USD', '1000')
  .option('-m, --min-apr <percent>', 'Minimum APR percentage', String(config.MIN_APR_PERCENT))
  .action(async (options: { size: string; minApr: string }) => {
    console.log(chalk.bold.cyan('\n═══ FUNDING RATE FARMER ═══\n'));
    console.log(`Simulation mode: ${config.SIMULATION_ONLY ? chalk.green('ON') : chalk.red('OFF')}\n`);

    const minApr = parseFloat(options.minApr) || config.MIN_APR_PERCENT;
    const sizeUsd = parseFloat(options.size) || 1000;

    const opportunities = await scanOpportunities(minApr);

    if (opportunities.length === 0) {
      console.log(chalk.yellow('❌ No opportunities found above the minimum APR threshold.'));
      return;
    }

    const best = opportunities[0];
    const entryPrice = await estimateEntryPrice(best);

    if (entryPrice === null) {
      console.log(chalk.red('❌ Could not determine entry price. Aborting.'));
      return;
    }

    await openPosition(best, sizeUsd, entryPrice);
    console.log(chalk.green('\n✅ Position opened successfully!'));
  });

program
  .command('status')
  .description('Show current open positions')
  .action(() => {
    console.log(chalk.bold.cyan('\n═══ FUNDING RATE FARMER ═══\n'));
    displayPositions();
  });

program
  .command('close')
  .description('Close a specific position')
  .argument('<position-id>', 'Position ID to close')
  .action(async (positionId: string) => {
    console.log(chalk.bold.cyan('\n═══ FUNDING RATE FARMER ═══\n'));

    const pos = getPositions().find((p) => p.id.startsWith(positionId));
    if (!pos) {
      console.log(chalk.red(`❌ Position not found: ${positionId}`));
      return;
    }

    await closePosition(pos.id);
    console.log(chalk.green('\n✅ Position closed successfully!'));
  });

/**
 * Estimate the current entry price for a market.
 *
 * For simulation mode, returns a reasonable estimate based on the
 * venue. In production this would come from the actual order book.
 *
 * @returns Price in USD, or null if unavailable
 */
async function estimateEntryPrice(_opportunity: FarmingOpportunity): Promise<number | null> {
  // In simulation mode, return a placeholder price.
  // Real implementation would fetch the current mark price from the venue.
  const priceMap: Record<string, number> = {
    'SOL-PERP': 142.50,
    'BTC-PERP': 67500,
    'ETH-PERP': 3450,
    'APT-PERP': 8.20,
    'ARB-PERP': 1.10,
    'DOGE-PERP': 0.15,
    'BNB-PERP': 595,
    'OP-PERP': 2.45,
    'SUI-PERP': 1.80,
    'TIA-PERP': 8.50,
    'WIF-PERP': 2.90,
  };

  return priceMap[_opportunity.marketSymbol] ?? 100;
}

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
