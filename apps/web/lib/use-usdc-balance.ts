"use client";

import { erc20Abi } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { POLYGON_CHAIN_ID, POLYGON_USDC, USDC_DECIMALS } from "~/lib/flow/config";

/**
 * The fan's spendable balance, in plain dollars — the embedded wallet's native
 * USDC on Polygon (what the premium is paid from). Polls so it reflects a
 * Blink top-up without a refresh. `usd` is null until the wallet is connected
 * and the read resolves.
 */
export function useUsdcBalance() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContract({
    address: POLYGON_USDC as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: Number(POLYGON_CHAIN_ID),
    query: {
      enabled: Boolean(address),
      refetchInterval: 15_000,
    },
  });

  const usd = typeof data === "bigint" ? Number(data) / 10 ** USDC_DECIMALS : null;

  return { usd, isLoading, refetch };
}
