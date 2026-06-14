// CoverPool wiring config. The vault address is set via NEXT_PUBLIC_COVERPOOL_ADDRESS
// once the contract is deployed (see packages/contracts/README.md). Until then the
// app skips the on-chain policy mint entirely — the checkout works exactly as before.
import { env } from "~/env";

// The vault settles + pays out on Polygon mainnet, co-located with the hedge.
export const COVERPOOL_CHAIN_ID = 137;

// Block the deployed CoverPool was created in — the floor for event log scans
// (GameOpened / PolicyBought) so the Desk doesn't walk the whole chain.
export const COVERPOOL_DEPLOY_BLOCK = 88479602n;

// CoverPool collateral = bridged USDC.e (6 decimals). The premium is paid in this
// token — Flow settles the fan's payment into USDC.e, then buyPolicy pulls it.
export const COVERPOOL_COLLATERAL_DECIMALS = 6;

/** The deployed CoverPool address, or null when not yet configured. */
export function coverPoolAddress(): `0x${string}` | null {
  const raw = env.NEXT_PUBLIC_COVERPOOL_ADDRESS;
  return raw ? (raw as `0x${string}`) : null;
}

/** True once a CoverPool address is set — gates the on-chain policy mint. */
export function isCoverPoolConfigured(): boolean {
  return coverPoolAddress() !== null;
}
