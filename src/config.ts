import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  HELIOS_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SOLANA_WALLET_JSON: z.string().default(''),
  DRIFT_API_URL: z.string().default(''),
  ZETA_API_URL: z.string().default(''),
  HYPERLIQUID_API_URL: z.string().default('https://api.hyperliquid.xyz'),
  MIN_APR_PERCENT: z.coerce.number().positive().default(20),
  SIMULATION_ONLY: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true' || v === '1'),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`   • ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

export const config = loadConfig();

export type Config = ReturnType<typeof loadConfig>;
