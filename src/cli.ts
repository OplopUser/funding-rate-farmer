#!/usr/bin/env node

/**
 * Funding Rate Farmer CLI (paper trading only).
 *
 *   scan                 rank current funding opportunities across venues
 *   farm                 open a paper position in the best (or a chosen) opportunity
 *   status               list paper positions with live mark prices and PnL
 *   close <id-prefix>    close a paper position at the live mark price
 */

import { Command, InvalidArgumentError, Option } from 'commander';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { fetchAllRates, fetchMarkPrice, type ScanResult } from './scanner.js';
import { rankOpportunities } from './ranking.js';
import {
  closePaperPosition,
  computePnl,
  loadPositions,
  openPaperPosition,
  resolvePositionId,
} from './positions.js';
import {
  printOpportunities,
  printPnl,
  printPosition,
  printPositionsTable,
  printVenueReports,
} from './display.js';
import { Venue, type FarmingOpportunity } from './types.js';

const VERSION = '0.2.0';

function nonNegativeNumber(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new InvalidArgumentError('must be a non-negative number');
  return n;
}

function positiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError('must be a positive integer');
  return n;
}

const venueOption = () =>
  new Option('--venue <venue>', 'only scan one venue')
    .choices(Object.values(Venue).map((v) => v.toLowerCase()))
    .argParser((v) => v.toUpperCase() as Venue);

function banner(): void {
  console.log(chalk.bold.cyan('\nFunding Rate Farmer') + chalk.dim(`  v${VERSION}  (paper trading only)\n`));
}

async function scan(venue?: Venue): Promise<ScanResult> {
  const cfg = loadConfig();
  console.log('Fetching funding rates...');
  const result = await fetchAllRates({
    solanaRpcUrl: cfg.SOLANA_RPC_URL,
    hyperliquidApiUrl: cfg.HYPERLIQUID_API_URL,
    venues: venue ? [venue] : undefined,
  });
  printVenueReports(result.reports);
  return result;
}

const program = new Command();

program
  .name('funding-rate-farmer')
  .description('Scan perp funding rates on Hyperliquid and Drift and paper-trade the earning side')
  .version(VERSION);

program
  .command('scan')
  .description('Rank current funding-rate opportunities')
  .option('-m, --min-apr <percent>', 'minimum APR in percent (default: MIN_APR_PERCENT)', nonNegativeNumber)
  .option('--min-oi <usd>', 'minimum open interest in USD (default: MIN_OPEN_INTEREST_USD)', nonNegativeNumber)
  .option('-n, --limit <rows>', 'rows to show', positiveInt, 20)
  .addOption(venueOption())
  .action(async (o: { minApr?: number; minOi?: number; limit: number; venue?: Venue }) => {
    const cfg = loadConfig();
    banner();
    const minAprPercent = o.minApr ?? cfg.MIN_APR_PERCENT;
    const minOpenInterestUsd = o.minOi ?? cfg.MIN_OPEN_INTEREST_USD;
    const { rates } = await scan(o.venue);
    const opps = rankOpportunities(rates, { minAprPercent, minOpenInterestUsd });
    console.log(
      `${opps.length} opportunities with APR >= ${minAprPercent}% and open interest >= $${minOpenInterestUsd.toLocaleString('en-US')}\n`,
    );
    printOpportunities(opps, o.limit);
  });

program
  .command('farm')
  .description('Open a paper position in the top-ranked opportunity (or --market)')
  .option('-s, --size <usd>', 'position notional in USD', nonNegativeNumber, 1000)
  .option('-m, --min-apr <percent>', 'minimum APR in percent (default: MIN_APR_PERCENT)', nonNegativeNumber)
  .option('--min-oi <usd>', 'minimum open interest in USD (default: MIN_OPEN_INTEREST_USD)', nonNegativeNumber)
  .option('--market <symbol>', 'pick this market (e.g. SOL-PERP) instead of the top-ranked one')
  .addOption(venueOption())
  .action(
    async (o: { size: number; minApr?: number; minOi?: number; market?: string; venue?: Venue }) => {
      const cfg = loadConfig();
      banner();
      const { rates } = await scan(o.venue);
      const opps = rankOpportunities(rates, {
        minAprPercent: o.minApr ?? cfg.MIN_APR_PERCENT,
        minOpenInterestUsd: o.minOi ?? cfg.MIN_OPEN_INTEREST_USD,
      });

      let pick: FarmingOpportunity | undefined;
      if (o.market) {
        const want = o.market.toUpperCase();
        pick = opps.find((x) => x.marketSymbol.toUpperCase() === want);
        if (!pick) {
          console.error(chalk.red(`${o.market} is not among the opportunities passing the filters.`));
          process.exitCode = 1;
          return;
        }
      } else {
        pick = opps[0];
        if (!pick) {
          console.error(chalk.yellow('No opportunity passes the filters; nothing opened.'));
          process.exitCode = 1;
          return;
        }
      }

      const position = openPaperPosition(cfg.POSITIONS_FILE, pick, o.size);
      console.log(chalk.green('Opened paper position:'));
      printPosition(position);
      console.log(chalk.dim(`\nSaved to ${cfg.POSITIONS_FILE}. Close it with: close ${position.id}\n`));
    },
  );

program
  .command('status')
  .description('List open paper positions with live mark prices and PnL')
  .action(async () => {
    const cfg = loadConfig();
    banner();
    const positions = loadPositions(cfg.POSITIONS_FILE);
    const now = new Date();
    const rows = await Promise.all(
      positions.map(async (position) => {
        try {
          const price = await fetchMarkPrice(position.venue, position.marketSymbol, {
            solanaRpcUrl: cfg.SOLANA_RPC_URL,
            hyperliquidApiUrl: cfg.HYPERLIQUID_API_URL,
          });
          return { position, pnl: computePnl(position, price, now) };
        } catch (err) {
          return { position, error: (err as Error).message };
        }
      }),
    );
    printPositionsTable(rows);
  });

program
  .command('close')
  .description('Close a paper position at the live mark price')
  .argument('<id-prefix>', 'position ID or any unique prefix of it')
  .action(async (idPrefix: string) => {
    const cfg = loadConfig();
    banner();
    const resolved = resolvePositionId(loadPositions(cfg.POSITIONS_FILE), idPrefix);
    if (!resolved.ok) {
      console.error(chalk.red(resolved.error));
      process.exitCode = 1;
      return;
    }
    const { venue, marketSymbol, id } = resolved.position;
    const price = await fetchMarkPrice(venue, marketSymbol, {
      solanaRpcUrl: cfg.SOLANA_RPC_URL,
      hyperliquidApiUrl: cfg.HYPERLIQUID_API_URL,
    });
    const { position, pnl } = closePaperPosition(cfg.POSITIONS_FILE, id, price);
    console.log(chalk.green('Closed paper position:'));
    printPosition(position);
    printPnl(pnl);
    console.log('');
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(`Error: ${(err as Error).message ?? err}`));
  process.exitCode = 1;
});
