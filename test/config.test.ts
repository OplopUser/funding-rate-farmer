import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

describe('parseConfig', () => {
  it('uses defaults when nothing is set', () => {
    const r = parseConfig({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.SOLANA_RPC_URL).toBe('https://api.mainnet-beta.solana.com');
      expect(r.config.HYPERLIQUID_API_URL).toBe('https://api.hyperliquid.xyz');
      expect(r.config.MIN_APR_PERCENT).toBe(20);
      expect(r.warnings).toEqual([]);
    }
  });

  it('reads HELIUS_RPC_URL', () => {
    const r = parseConfig({ HELIUS_RPC_URL: 'https://rpc.example.com/' });
    expect(r.ok && r.config.SOLANA_RPC_URL).toBe('https://rpc.example.com/');
  });

  it('accepts the misspelled HELIOS_RPC_URL as a deprecated fallback', () => {
    const r = parseConfig({ HELIOS_RPC_URL: 'https://old.example.com' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.SOLANA_RPC_URL).toBe('https://old.example.com');
      expect(r.warnings[0]).toMatch(/HELIOS_RPC_URL is deprecated/);
    }
  });

  it('prefers HELIUS_RPC_URL when both are set, without a warning', () => {
    const r = parseConfig({ HELIUS_RPC_URL: 'https://new.example.com', HELIOS_RPC_URL: 'https://old.example.com' });
    expect(r.ok && r.config.SOLANA_RPC_URL).toBe('https://new.example.com');
    expect(r.ok && r.warnings).toEqual([]);
  });

  it('treats empty values as unset and reports invalid ones', () => {
    expect(parseConfig({ HELIUS_RPC_URL: '' }).ok).toBe(true);
    const bad = parseConfig({ HELIUS_RPC_URL: 'not a url', MIN_APR_PERCENT: '-1' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join('\n')).toMatch(/HELIUS_RPC_URL/);
  });
});
