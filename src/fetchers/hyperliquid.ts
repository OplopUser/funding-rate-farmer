/**
 * Hyperliquid funding-rate fetcher.
 *
 * Uses the public info endpoint (no API key):
 *
 *   POST {HYPERLIQUID_API_URL}/info   {"type": "metaAndAssetCtxs"}
 *
 * Response (abridged, verified against the live API):
 *
 *   [
 *     { "universe": [ { "name": "BTC", "szDecimals": 5, "maxLeverage": 40,
 *                       "isDelisted"?: true }, ... ],
 *       "marginTables": [...], "collateralToken": 0 },
 *     [ { "funding": "0.0000125", "markPx": "76974.0", "oraclePx": "76982.0",
 *         "openInterest": "41381.73868", "premium": "-0.0001", ... }, ... ]
 *   ]
 *
 * `universe[i]` and the context at index `i` describe the same asset.
 * `funding` is the current hourly rate as a decimal fraction of notional
 * (positive → longs pay shorts); funding is paid every hour.
 * `openInterest` is in base units, so OI in USD = openInterest × markPx.
 */

import { type FundingRate, type VenueFetchResult, Venue } from '../types.js';

export const HYPERLIQUID_FUNDING_INTERVAL_HOURS = 1;

interface HyperliquidUniverseEntry {
  name: string;
  szDecimals?: number;
  maxLeverage?: number;
  isDelisted?: boolean;
}

interface HyperliquidAssetCtx {
  funding?: string | null;
  markPx?: string | null;
  oraclePx?: string | null;
  openInterest?: string | null;
}

export type HyperliquidMetaAndAssetCtxs = [
  { universe: HyperliquidUniverseEntry[] },
  HyperliquidAssetCtx[],
];

/**
 * Convert a `metaAndAssetCtxs` response into normalised funding rates.
 * Delisted markets and entries without a usable funding rate or price are
 * skipped.
 */
export function parseHyperliquidMetaAndAssetCtxs(
  data: unknown,
  fetchedAt: Date = new Date(),
): VenueFetchResult {
  if (!Array.isArray(data) || data.length < 2) {
    throw new Error('Unexpected Hyperliquid response: expected [meta, assetCtxs]');
  }
  const [meta, ctxs] = data as HyperliquidMetaAndAssetCtxs;
  if (!meta || !Array.isArray(meta.universe) || !Array.isArray(ctxs)) {
    throw new Error('Unexpected Hyperliquid response: missing universe or asset contexts');
  }

  const warnings: string[] = [];
  if (meta.universe.length !== ctxs.length) {
    warnings.push(
      `universe has ${meta.universe.length} markets but ${ctxs.length} asset contexts`,
    );
  }

  const rates: FundingRate[] = [];
  let delisted = 0;
  const n = Math.min(meta.universe.length, ctxs.length);
  for (let i = 0; i < n; i++) {
    const market = meta.universe[i];
    const ctx = ctxs[i];
    if (!market || !ctx) continue;
    if (market.isDelisted) {
      delisted++;
      continue;
    }

    const rate = Number(ctx.funding);
    const markPrice = Number(ctx.markPx ?? ctx.oraclePx);
    if (ctx.funding == null || !Number.isFinite(rate) || !(markPrice > 0)) continue;

    const oiBase = Number(ctx.openInterest);
    rates.push({
      venue: Venue.HYPERLIQUID,
      marketSymbol: `${market.name}-PERP`,
      rate,
      intervalHours: HYPERLIQUID_FUNDING_INTERVAL_HOURS,
      markPrice,
      openInterestUsd: Number.isFinite(oiBase) ? oiBase * markPrice : undefined,
      fetchedAt,
    });
  }

  if (delisted > 0) warnings.push(`skipped ${delisted} delisted markets`);
  return { venue: Venue.HYPERLIQUID, rates, warnings };
}

/**
 * Fetch current funding rates and mark prices for every listed Hyperliquid perp.
 */
export async function fetchHyperliquidFundingRates(
  apiUrl = 'https://api.hyperliquid.xyz',
): Promise<VenueFetchResult> {
  const resp = await fetch(`${apiUrl.replace(/\/+$/, '')}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    throw new Error(`Hyperliquid info request failed: HTTP ${resp.status}`);
  }
  return parseHyperliquidMetaAndAssetCtxs(await resp.json());
}
