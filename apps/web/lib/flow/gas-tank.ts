import "server-only";

import { formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { env } from "~/env";
import { polygonPublicClient, polygonWalletClient } from "../cover-pool/settler";

/**
 * Gas drip for embedded wallets.
 *
 * Polygon charges gas in native POL, but a fan's embedded wallet is funded in
 * USDC (via Blink) — so it can be fully dollar-funded yet hold 0 POL, and
 * Flow's `prepare` step (`assertBalanceForGasCost`) hard-fails before the fan
 * can even sign ("Insufficient POL balance for gas: need …, have 0 POL").
 *
 * Until real gas sponsorship lands (ROADMAP P3 — Dynamic's EVM sponsorship
 * needs V3 MPC wallets + an enterprise plan), we top the wallet up from a small
 * "gas tank" we control: send just enough POL to cover the approve + transfer,
 * so the fan never has to think about gas. A few cents of POL covers hundreds
 * of checkouts (the error we saw needed ~0.0099 POL).
 *
 * Server-only. The tank key is GAS_TANK_PRIVATE_KEY, falling back to the
 * generic PRIVATE_KEY (the same funded wallet the hedge/settler already use),
 * so a single funded key is enough to get this working.
 */

// Top a short wallet up to this POL balance. ~0.05 POL is a couple of cents and
// comfortably covers an ERC-20 approve + transfer on Polygon.
const DEFAULT_TARGET_POL = "0.05";

function targetWei(): bigint {
  return parseEther(env.FLOW_GAS_TARGET_POL ?? DEFAULT_TARGET_POL);
}

function resolveGasTankKey(): `0x${string}` | null {
  const raw = env.GAS_TANK_PRIVATE_KEY ?? env.PRIVATE_KEY;
  if (!raw) return null;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

export type GasTopUpResult =
  | { status: "skipped"; reason: string }
  | { status: "sufficient"; balancePol: string }
  | { status: "funded"; sentPol: string; txHash: `0x${string}` }
  | { status: "error"; message: string };

/**
 * Ensure `wallet` holds enough POL for gas on Polygon, dripping the shortfall
 * from the gas tank if it's low. Idempotent (a no-op once funded) and it never
 * throws — it returns a status the caller can log. On any failure it falls
 * through, so the normal Flow flow still runs and surfaces the clear
 * "Insufficient POL" error exactly as before: this can only help, never worsen.
 */
export async function topUpGasIfNeeded(wallet: string): Promise<GasTopUpResult> {
  const key = resolveGasTankKey();
  if (!key) {
    return { status: "skipped", reason: "no GAS_TANK_PRIVATE_KEY / PRIVATE_KEY configured" };
  }

  try {
    const target = targetWei();
    const account = privateKeyToAccount(key);
    const pub = polygonPublicClient();
    const to = wallet as `0x${string}`;

    const balance = await pub.getBalance({ address: to });
    if (balance >= target) return { status: "sufficient", balancePol: formatEther(balance) };

    const deficit = target - balance;
    const tank = await pub.getBalance({ address: account.address });
    if (tank < deficit) {
      return {
        status: "error",
        message:
          `gas tank ${account.address} is too low: has ${formatEther(tank)} POL, ` +
          `needs ≥ ${formatEther(deficit)} POL — refill it`,
      };
    }

    const txHash = await polygonWalletClient(account).sendTransaction({ to, value: deficit });
    // Wait for the drip to mine so the subsequent `prepare` gas check sees it.
    await pub.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });

    return { status: "funded", sentPol: formatEther(deficit), txHash };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}
