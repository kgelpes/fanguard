import { RelayClient, type DepositWalletCall } from "@polymarket/builder-relayer-client";
import {
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  maxUint256,
  type Address,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { ctfAbi, CONDITIONAL_TOKENS, DEFAULT_POLYGON_RPC, PUSD, SPENDERS } from "./onchain";

/**
 * Polymarket V2 deposit-wallet flow.
 *
 * Post-migration the CLOB rejects raw EOA makers ("maker address not allowed,
 * please use the deposit wallet flow"). Each EOA instead controls a CREATE2
 * smart-contract "deposit wallet" that holds the pUSD and is the order maker;
 * the EOA signs (ERC-1271 / POLY_1271). Wallet creation and the on-chain
 * approvals are gasless — submitted through Polymarket's relayer, which pays gas.
 * See `reference-polymarket-v2-pusd`.
 */

export const RELAYER_URL = "https://relayer-v2.polymarket.com";

export interface RelaySession {
  relay: RelayClient;
  walletClient: WalletClient;
  eoa: Address;
}

/**
 * Build a relay client. A `builderConfig` (from CLOB `createBuilderApiKey()`) is
 * required only for the authed endpoints — deploy + approval batch; the read
 * paths (derive address, getDeployed) work without it.
 */
export function makeRelayClient(
  privateKey: `0x${string}`,
  rpcUrl?: string,
  builderConfig?: ConstructorParameters<typeof RelayClient>[3],
): RelaySession {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(rpcUrl ?? DEFAULT_POLYGON_RPC),
  });
  // Cast at the boundary: pnpm resolves the relayer client's viem under a
  // different TS peer, so its WalletClient is a nominally distinct (but runtime-
  // identical) type. Same viem 2.52.2 at runtime.
  const relay = new RelayClient(
    RELAYER_URL,
    137,
    walletClient as unknown as ConstructorParameters<typeof RelayClient>[2],
    builderConfig,
  );
  return { relay, walletClient, eoa: account.address };
}

/** Derive the deposit wallet address and deploy it via the relayer if needed. */
export async function ensureDepositWallet(
  relay: RelayClient,
): Promise<{ address: Address; justDeployed: boolean }> {
  const address = (await relay.deriveDepositWalletAddress()) as Address;
  if (await relay.getDeployed(address)) return { address, justDeployed: false };
  const res = await relay.deployDepositWallet();
  await res.wait();
  return { address, justDeployed: true };
}

/** Calls that let the V2 exchanges move the deposit wallet's pUSD + outcome shares. */
export function buildApprovalCalls(): DepositWalletCall[] {
  const calls: DepositWalletCall[] = [];
  for (const spender of SPENDERS) {
    calls.push({
      target: PUSD,
      value: "0",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      }),
    });
    calls.push({
      target: CONDITIONAL_TOKENS,
      value: "0",
      data: encodeFunctionData({
        abi: ctfAbi,
        functionName: "setApprovalForAll",
        args: [spender, true],
      }),
    });
  }
  return calls;
}

/** Submit the trading approvals as a single relayer batch from the deposit wallet. */
export async function approveDepositWallet(relay: RelayClient, walletAddress: Address): Promise<void> {
  const deadline = String(Math.floor(Date.now() / 1000) + 3600);
  const res = await relay.executeDepositWalletBatch(buildApprovalCalls(), walletAddress, deadline);
  await res.wait();
}
