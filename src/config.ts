import * as dotenv from 'dotenv';
import { z } from 'zod';

const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

const envSchema = z.object({
  HELIUS_RPC_URL: z.string().url().optional(),
  /** @deprecated misspelling of HELIUS_RPC_URL, still accepted as a fallback */
  HELIOS_RPC_URL: z.string().url().optional(),
  HYPERLIQUID_API_URL: z.string().url().default('https://api.hyperliquid.xyz'),
  MIN_APR_PERCENT: z.coerce.number().nonnegative().default(20),
  MIN_OPEN_INTEREST_USD: z.coerce.number().nonnegative().default(100_000),
  POSITIONS_FILE: z.string().min(1).default('data/positions.json'),
});

export interface Config {
  /** Solana RPC used to read Drift market accounts */
  SOLANA_RPC_URL: string;
  HYPERLIQUID_API_URL: string;
  MIN_APR_PERCENT: number;
  MIN_OPEN_INTEREST_USD: number;
  POSITIONS_FILE: string;
}

export type ConfigResult =
  | { ok: true; config: Config; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Parse and validate configuration from an environment object.
 * Pure: does not read .env or exit, so it can be unit tested.
 */
export function parseConfig(env: Record<string, string | undefined>): ConfigResult {
  // Treat empty strings as unset so `FOO=` in .env falls back to the default.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const e = parsed.data;
  const warnings: string[] = [];
  let rpc = e.HELIUS_RPC_URL;
  if (!rpc && e.HELIOS_RPC_URL) {
    rpc = e.HELIOS_RPC_URL;
    warnings.push('HELIOS_RPC_URL is deprecated; rename it to HELIUS_RPC_URL.');
  }

  return {
    ok: true,
    warnings,
    config: {
      SOLANA_RPC_URL: rpc ?? DEFAULT_SOLANA_RPC_URL,
      HYPERLIQUID_API_URL: e.HYPERLIQUID_API_URL.replace(/\/+$/, ''),
      MIN_APR_PERCENT: e.MIN_APR_PERCENT,
      MIN_OPEN_INTEREST_USD: e.MIN_OPEN_INTEREST_USD,
      POSITIONS_FILE: e.POSITIONS_FILE,
    },
  };
}

let cached: Config | undefined;

/**
 * Load `.env`, validate the environment and cache the result.
 * Prints deprecation warnings to stderr; exits the process on invalid config.
 */
export function loadConfig(): Config {
  if (cached) return cached;
  dotenv.config({ quiet: true });
  const result = parseConfig(process.env);
  if (!result.ok) {
    console.error('Invalid environment configuration:');
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  for (const w of result.warnings) console.warn(`Warning: ${w}`);
  cached = result.config;
  return cached;
}
