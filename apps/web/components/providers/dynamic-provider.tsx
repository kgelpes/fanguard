"use client";

import type { ReactNode } from "react";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fallback, http } from "viem";
import { arbitrum, base, mainnet, polygon } from "viem/chains";
import { createConfig, WagmiProvider } from "wagmi";

import { env } from "~/env";

// Polygon RPCs, in failover order. `http()` with no URL falls back to viem's
// default (polygon.drpc.org), a load-balanced aggregator that intermittently
// answers eth_getTransactionReceipt with "Unknown block" (a backend node that
// hasn't indexed the tx's block yet) — which breaks waitForTransactionReceipt
// mid-mint. Use a `fallback` across stable nodes so one lagging node fails over
// instead of erroring. Set NEXT_PUBLIC_POLYGON_RPC_URL to a keyed RPC (Alchemy/
// Infura) to put a high-reliability endpoint first.
const polygonRpcUrls = [
  env.NEXT_PUBLIC_POLYGON_RPC_URL,
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon-rpc.com",
].filter((url): url is string => Boolean(url));

// wagmi config — FanGuard SETTLES on Polygon mainnet (137), co-located with the
// Polymarket hedge. The fan can PAY from any of these chains, though (Dynamic
// Flow swaps/bridges to the settlement USDC), so each must be a wagmi chain the
// embedded wallet can switch to and sign on. Keep in sync with PAYMENT_SOURCES.
// Dynamic injects the embedded wallet as the connector via
// <DynamicWagmiConnector>, so no connectors are listed here.
const config = createConfig({
  chains: [polygon, mainnet, base, arbitrum],
  multiInjectedProviderDiscovery: false,
  transports: {
    [polygon.id]: fallback(polygonRpcUrls.map((url) => http(url))),
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
  },
});

const queryClient = new QueryClient();

/**
 * Wraps the checkout in Dynamic (login + embedded wallet) bridged to wagmi, so
 * the rest of the tree can read the wallet with standard wagmi hooks
 * (`useAccount`, `useSignMessage`, `useWriteContract`).
 */
export function DynamicProvider({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>{children}</DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  );
}
