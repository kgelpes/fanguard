import "server-only";

import { privateKeyToAccount } from "viem/accounts";

import { env } from "~/env";

/**
 * Hedge signing key + its EOA address, resolved in one place so the Flow
 * settlement destination and the hedge desk always agree on the same wallet.
 *
 * Accepts either HEDGE_PRIVATE_KEY (preferred) or the generic PRIVATE_KEY, so a
 * deployment that only sets PRIVATE_KEY still works. Kept dependency-light (no
 * CLOB client) so the Flow server can import it without pulling in the SDK.
 */

/** The hedge signing key (0x-prefixed), or null if none is configured. */
export function resolveHedgePrivateKey(): `0x${string}` | null {
  const raw = env.HEDGE_PRIVATE_KEY ?? env.PRIVATE_KEY;
  if (!raw) return null;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

/**
 * The hedge EOA address. The premium settles here so `fundDepositWalletFromEoa`
 * can sweep it into the desk's buying power. Null when no key is configured.
 */
export function hedgeEoaAddress(): string | null {
  const key = resolveHedgePrivateKey();
  return key ? privateKeyToAccount(key).address : null;
}
