"use client";

import type { ReactNode } from "react";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { polygon } from "viem/chains";
import { createConfig, WagmiProvider } from "wagmi";

import { env } from "~/env";

// wagmi config — Fanguard settles on Polygon mainnet (chain 137), co-located
// with the Polymarket hedge. Dynamic injects the embedded wallet as the
// connector via <DynamicWagmiConnector>, so no connectors are listed here.
const config = createConfig({
  chains: [polygon],
  multiInjectedProviderDiscovery: false,
  transports: {
    [polygon.id]: http(),
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
