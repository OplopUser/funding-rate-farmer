# Funding Rate Farmer

A multi-venue **funding rate farming bot** that scans perpetual DEXes for the best funding rate opportunities, ranks them by annualized APR, and manages positions across four venues.

Supported venues:
- **Drift Protocol** (Solana) — largest perp DEX on Solana
- **Zeta Markets** (Solana) — option-settled perp DEX
- **Mango Markets** (Solana) — cross-margin perp DEX
- **Hyperliquid** (Standalone L1) — high-performance perp exchange

## What is Funding Rate Farming?

Perpetual futures (perps) use **funding rates** — periodic payments between long and short traders — to keep the contract price anchored to the spot price. When funding is positive, longs pay shorts; when negative, shorts pay longs.

**Funding rate farming** is the strategy of taking the side that **receives** funding payments, collecting yield on your position size. Annualized APRs can range from 5% to 200%+ depending on market conditions.

⚠️ **WARNING**: Funding rates are variable and can **reverse direction** quickly. A position that earns today may pay tomorrow. This is **not risk-free** — you can lose more in mark-to-market price moves than you earn in funding. Never trade with money you can't afford to lose.

## Architecture

```
funding-rate-farmer/
├── src/
│   ├── index.ts              # Public API exports
│   ├── cli.ts                # CLI runner (Commander)
│   ├── types.ts              # Core TypeScript types
│   ├── config.ts             # Environment config (Zod-validated)
│   ├── apr.ts                # APR calculation utilities
│   ├── scanner.ts            # Multi-venue scanner & ranker
│   ├── positions.ts          # Position manager (paper/live)
│   └── fetchers/
│       ├── index.ts          # Barrel exports
│       ├── drift.ts          # Drift Protocol fetcher
│       ├── zeta.ts           # Zeta Markets fetcher
│       ├── mango.ts          # Mango Markets fetcher
│       └── hyperliquid.ts    # Hyperliquid fetcher
├── data/                     # Position persistence (auto-created)
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Venue Integrations

### Drift Protocol
- **SDK**: `@drift-labs/sdk` — connects to DriftClient, subscribes to perp market accounts, reads `amm.fundingRate` from each market
- **Funding interval**: 1 hour
- **APR formula**: `rate × 24 × 365`
- **Fallback**: Configurable REST API via `DRIFT_API_URL` env var

### Zeta Markets
- **SDK**: `@zetamarkets/sdk` — loads cross-client, reads `cross.fundingRate` per market group
- **Funding interval**: 1 hour
- **APR formula**: `rate × 24 × 365`
- **Fallback**: Configurable REST API via `ZETA_API_URL` env var

### Mango Markets
- **SDK**: `@blockworks-foundation/mango-client` — connects to Mango v4 program, reads perp market `fundingRate`
- **Funding interval**: 1 hour
- **APR formula**: `rate × 24 × 365`
- **Fallback**: Public REST API at `https://api.mango.markets/v3/perp-markets`

### Hyperliquid
- **API**: Direct REST calls to `https://api.hyperliquid.xyz/info`
- **Endpoint**: `POST {"type": "metaAndAssetCtxs"}` — returns universe metadata and asset contexts including funding rates
- **Funding interval**: 1 hour
- **APR formula**: `rate × 24 × 365`
- **No API key needed** for public endpoints

## Setup

### Prerequisites
- Node.js >= 20
- npm or yarn

### Installation

```bash
# Clone or navigate to the project
cd funding-rate-farmer

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your RPC endpoints and preferences
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `HELIOS_RPC_URL` | Solana RPC URL (Helius recommended) | `https://api.mainnet-beta.solana.com` |
| `SOLANA_WALLET_JSON` | Path to Solana keypair file | _(empty — simulation only)_ |
| `DRIFT_API_URL` | Drift REST API fallback URL | _(empty)_ |
| `ZETA_API_URL` | Zeta REST API fallback URL | _(empty)_ |
| `HYPERLIQUID_API_URL` | Hyperliquid API base URL | `https://api.hyperliquid.xyz` |
| `MIN_APR_PERCENT` | Minimum APR threshold for opportunities | `20` |
| `SIMULATION_ONLY` | Paper trading mode (no real orders) | `true` |

## Usage

### Scan for opportunities

```bash
# Show all opportunities above default APR threshold (20%)
npm run scan

# Or with custom minimum APR
npm run dev -- scan --min-apr 50
```

### Farm (enter the best position)

```bash
# Enter the top-ranked position (default $1000 simulation)
npm run farm

# With custom size and APR threshold
npm run dev -- farm --size 5000 --min-apr 30
```

### Check status

```bash
# Show all open positions
npm run status
```

### Close a position

```bash
# Close by position ID prefix
npm run dev -- close pos_1712345678
```

### Using the compiled binary

```bash
npm run build
./dist/cli.js scan
# or
npx funding-rate-farmer scan
```

## APR Calculation

All rates are normalized to **annualized APR** for cross-venue comparison:

```
APR = funding_rate × intervals_per_day × 365
```

Where:
- **1h funding**: `intervals_per_day = 24` → `APR = rate × 24 × 365`
- **8h funding**: `intervals_per_day = 3` → `APR = rate × 3 × 365`

Both long and short sides are evaluated:
- **Positive rate** → longs pay shorts → **short earns**
- **Negative rate** → shorts pay longs → **long earns**

## Risk Disclaimer

**Funding rate farming carries significant risk:**

1. **Funding rate reversal**: Rates can flip within hours. A +100% APR opportunity can become -100% APR.
2. **Impermanent loss / mark-to-market**: Price movements against your position can dwarf funding income.
3. **Liquidation risk**: Leveraged positions can be liquidated during volatility.
4. **Smart contract risk**: All venues are subject to potential exploits or bugs.
5. **Counterparty risk**: Off-exchange settlement (Hyperliquid) carries different risk profiles.

This bot is provided for **educational purposes only**. SIMULATION_ONLY mode is the default for a reason. Do not deploy real capital without thorough testing and understanding of the risks.

## Development

```bash
# Build TypeScript
npm run build

# Watch mode during development
npm run dev -- scan

# Clean build artifacts
npm run clean
```

## License

MIT
