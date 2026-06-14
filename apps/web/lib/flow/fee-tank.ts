import "server-only";

import { erc20Abi, formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { env } from "~/env";
import { polygonPublicClient, polygonWalletClient } from "../cover-pool/settler";
import { USDC_DECIMALS } from "./config";

/**
 * Swap-fee cover for the premium.
 *
 * The fan holds native USDC, but we settle the premium in USDC.e (CoverPool's
 * collateral / Polymarket's pUSD on-ramp token). Because those are different
 * tokens, Flow swaps USDC → USDC.e and the fan must pay ~1% on top of the
 * premium — so a wallet holding exactly the premium fails Flow's
 * `assertBalanceForTransferAmount` check ("need 5.05 USDC, have 5 USDC").
 *
 * Rather than make the fan top up a few cents, the house absorbs the spread:
 * we top the fan's wallet up to the fee-inclusive `fromAmount` from a treasury
 * we control, so they pay exactly their premium and one-tap stays intact. The
 * cost is ~1% of the premium per checkout — well inside FanGuard's edge.
 *
 * Server-only. The treasury key is FEE_TANK_PRIVATE_KEY, falling back to the
 * generic PRIVATE_KEY (the same funded wallet the hedge/settler/gas-tank use);
 * it must hold the pay token (native USDC) plus a little POL for its own gas.
 */

// Top up to slightly above the quoted `fromAmount` so a tiny re-quote on
// `prepare` can't reopen the shortfall. 1% of a $5 premium is ~$0.05 — pennies.
const BUFFER_BPS = 100n;

function resolveFeeTankKey(): `0x${string}` | null {
  const raw = env.FEE_TANK_PRIVATE_KEY ?? env.PRIVATE_KEY;
  if (!raw) return null;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

export type FeeTopUpResult =
  | { status: "skipped"; reason: string }
  | { status: "sufficient"; balance: string }
  | { status: "funded"; sent: string; txHash: `0x${string}` }
  | { status: "error"; message: string };

/**
 * Ensure `wallet` holds at least the fee-inclusive `requiredHuman` of `token`,
 * dripping the shortfall from the treasury if it's short. `requiredHuman` is
 * Flow's quoted `fromAmount` (a decimal string in token units, e.g. "5.053083").
 *
 * Idempotent (a no-op once covered) and it never throws — it returns a status
 * the caller can log. On any failure it falls through, so the normal Flow flow
 * still runs and surfaces the clear "Insufficient balance" error as before:
 * this can only help, never worsen.
 */
export async function topUpTransferShortfallIfNeeded(params: {
  wallet: string;
  token: `0x${string}`;
  requiredHuman: string;
  decimals?: number;
}): Promise<FeeTopUpResult> {
  const key = resolveFeeTankKey();
  if (!key) {
    return { status: "skipped", reason: "no FEE_TANK_PRIVATE_KEY / PRIVATE_KEY configured" };
  }

  try {
    const decimals = params.decimals ?? USDC_DECIMALS;
    const required = parseUnits(params.requiredHuman, decimals);
    const target = required + (required * BUFFER_BPS) / 10_000n;

    const account = privateKeyToAccount(key);
    const pub = polygonPublicClient();
    const to = params.wallet as `0x${string}`;

    const balance = await pub.readContract({
      address: params.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [to],
    });
    if (balance >= target) return { status: "sufficient", balance: formatUnits(balance, decimals) };

    const deficit = target - balance;
    const tank = await pub.readContract({
      address: params.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (tank < deficit) {
      return {
        status: "error",
        message:
          `fee tank ${account.address} is too low: has ${formatUnits(tank, decimals)}, ` +
          `needs ≥ ${formatUnits(deficit, decimals)} of ${params.token} — refill it`,
      };
    }

    const txHash = await polygonWalletClient(account).writeContract({
      address: params.token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, deficit],
    });
    // Wait for the drip to mine so the subsequent `prepare` transfer check sees it.
    await pub.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });

    return { status: "funded", sent: formatUnits(deficit, decimals), txHash };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}
