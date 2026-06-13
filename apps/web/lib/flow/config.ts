// Fireblocks Flow (Dynamic) — static config shared by the server proxy and the
// client payment hook. Nothing secret lives here; the `dyn_` API token is read
// only in `server.ts`. See https://www.dynamic.xyz/docs/overview/fireblocks-flow-api

export const FLOW_API_BASE = "https://app.dynamicauth.com/api/v0";

// Polygon mainnet (137) — Fanguard settles here, co-located with the Polymarket
// hedge. Flow groups EVM chains under the "EVM" family name.
export const POLYGON_CHAIN_ID = "137";
export const FLOW_CHAIN_NAME = "EVM";

// Native USDC on Polygon (6 decimals). It's both our settlement token AND the
// token the fan pays with by default — same chain, same token, so Flow builds a
// direct transfer (no swap/bridge). Flow still accepts any token/chain a fan
// holds; this is just the default `fromToken` for the embedded wallet.
// EIP-55 checksummed — Dynamic's Flow API rejects mixed-case addresses whose
// checksum doesn't verify (422). Keep this exact casing.
export const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
export const USDC_DECIMALS = 6;

// Where settled USDC lands. Treasury wallet for v1; swap to the CoverPool
// contract address when it ships (Phase 3). Overridable via FLOW_SETTLEMENT_ADDRESS.
export const DEFAULT_SETTLEMENT_ADDRESS = "0x68b38Be77c460A4451D651874cE10fd42cfe698B";

// Settlement state machine: none → routing → bridging → swapping → settling → completed.
// Same-chain/same-token payments jump straight to completed.
export const TERMINAL_EXECUTION_STATES = ["cancelled", "expired", "failed"];
export const TERMINAL_SETTLEMENT_STATES = ["completed", "failed"];

// EVM native-token sentinel for Flow quotes (ETH, POL, …).
export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

/** A token + chain the fan can pay FROM. Flow swaps/bridges it to the settlement USDC. */
export interface PaymentSource {
  /** Stable key for the picker. */
  id: string;
  /** Human label, e.g. "ETH · Ethereum". */
  label: string;
  /** Flow chain family. EVM for all of these. */
  chainName: "EVM";
  /** Numeric chain id (wagmi switch + stringified for the Flow API). */
  chainId: number;
  /** ERC-20 address, or NATIVE_TOKEN for the gas token. EIP-55 checksummed. */
  tokenAddress: string;
  symbol: string;
  isNative: boolean;
}

// What we accept as payment. Settlement is always USDC on Polygon — Flow routes
// any of these to it. The fan's embedded wallet must hold the token (+ gas) on
// that chain, and the chain must be enabled in the Dynamic dashboard.
export const PAYMENT_SOURCES: PaymentSource[] = [
  { id: "polygon-usdc", label: "USDC · Polygon", chainName: "EVM", chainId: 137, tokenAddress: POLYGON_USDC, symbol: "USDC", isNative: false },
  { id: "polygon-pol", label: "POL · Polygon", chainName: "EVM", chainId: 137, tokenAddress: NATIVE_TOKEN, symbol: "POL", isNative: true },
  { id: "ethereum-eth", label: "ETH · Ethereum", chainName: "EVM", chainId: 1, tokenAddress: NATIVE_TOKEN, symbol: "ETH", isNative: true },
  { id: "ethereum-usdc", label: "USDC · Ethereum", chainName: "EVM", chainId: 1, tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", isNative: false },
  { id: "base-usdc", label: "USDC · Base", chainName: "EVM", chainId: 8453, tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", isNative: false },
  { id: "arbitrum-usdc", label: "USDC · Arbitrum", chainName: "EVM", chainId: 42161, tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", isNative: false },
];

export const DEFAULT_PAYMENT_SOURCE_ID = "polygon-usdc";
export const DEFAULT_PAYMENT_SOURCE: PaymentSource =
  PAYMENT_SOURCES.find((s) => s.id === DEFAULT_PAYMENT_SOURCE_ID) ?? PAYMENT_SOURCES[0]!;

/** Resolve a source id to its config, falling back to the default. */
export function resolvePaymentSource(id: string): PaymentSource {
  return PAYMENT_SOURCES.find((s) => s.id === id) ?? DEFAULT_PAYMENT_SOURCE;
}
