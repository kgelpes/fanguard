import "server-only";

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { polygon } from "viem/chains";

import { env } from "~/env";

/**
 * The settler is FanGuard's pricing oracle: it signs every `BuyPolicy` quote and
 * is the only caller of `openGame` / `resolve`. Its address MUST equal the
 * deployed CoverPool's `settler` (the deploy defaults settler = deployer; set
 * SETTLER to this key's address otherwise). It needs a little POL for gas.
 *
 * Server-only — the key never reaches the browser. Mirrors lib/hedge/key.ts.
 */

function rpcUrl(): string {
  return env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com";
}

/** The settler signing key (0x-prefixed), or null when none is configured. */
export function resolveSettlerPrivateKey(): `0x${string}` | null {
  const raw = env.SETTLER_PRIVATE_KEY ?? env.PRIVATE_KEY;
  if (!raw) return null;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

/** The settler account, or null when no key is configured. */
export function settlerAccount(): PrivateKeyAccount | null {
  const key = resolveSettlerPrivateKey();
  return key ? privateKeyToAccount(key) : null;
}

/** Read-only Polygon client for nonces / game state. */
export function polygonPublicClient() {
  return createPublicClient({ chain: polygon, transport: http(rpcUrl()) });
}

/** A Polygon wallet client bound to `account` (signs + sends from that key). */
export function polygonWalletClient(account: PrivateKeyAccount) {
  return createWalletClient({ account, chain: polygon, transport: http(rpcUrl()) });
}

/** Settler wallet client for openGame / resolve transactions. */
export function settlerWalletClient(account: PrivateKeyAccount) {
  return polygonWalletClient(account);
}
