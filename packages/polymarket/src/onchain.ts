import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  maxUint256,
  type Account,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { getContractConfig } from "@polymarket/clob-client-v2";

/**
 * On-chain plumbing for trading on Polymarket's V2 (post-2026-04-28) contracts.
 *
 * Collateral is now **pUSD** (not USDC.e). To trade from a plain EOA you must,
 * once per wallet:
 *   1. hold pUSD (wrap bridged USDC.e via the CollateralOnramp), and
 *   2. approve pUSD + the ConditionalTokens (ERC-1155) to the V2 exchanges.
 * After that the CLOB client signs/posts orders off-chain. See the
 * `reference-polymarket-v2-pusd` project note for the full migration context.
 */

/** Default open Polygon RPC (polygon-rpc.com is gated). */
export const DEFAULT_POLYGON_RPC = "https://polygon-bor-rpc.publicnode.com";

/** Bridged USDC.e — the asset the CollateralOnramp wraps into pUSD. */
export const USDC_E: Address = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
/** Native (Circle) USDC on Polygon. */
export const USDC_NATIVE: Address = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
/** Polymarket CollateralOnramp: `wrap(asset, to, amount)` → pUSD. */
export const COLLATERAL_ONRAMP: Address = "0x93070a847efEf7F70739046A929D47a521F5B8ee";

const contracts = getContractConfig(137);
/** pUSD collateral token. */
export const PUSD = contracts.collateral as Address;
/** ConditionalTokens (ERC-1155) holding the outcome shares. */
export const CONDITIONAL_TOKENS = contracts.conditionalTokens as Address;

/**
 * The V2 contracts that must be able to move funds on the trader's behalf.
 * pUSD gets an ERC-20 approval; the CTF gets `setApprovalForAll`.
 */
export const SPENDERS: Address[] = [
  contracts.exchangeV2 as Address,
  contracts.negRiskExchangeV2 as Address,
  contracts.negRiskAdapter as Address,
];

export const ctfAbi = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const onrampAbi = [
  {
    type: "function",
    name: "wrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export interface Clients {
  account: Account;
  address: Address;
  publicClient: PublicClient;
  walletClient: WalletClient;
}

/** Build viem public + wallet clients from a private key. */
export function getClients(privateKey: `0x${string}`, rpcUrl?: string): Clients {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl ?? DEFAULT_POLYGON_RPC);
  const publicClient = createPublicClient({ chain: polygon, transport });
  const walletClient = createWalletClient({ account, chain: polygon, transport });
  return { account, address: account.address, publicClient, walletClient };
}

export interface Balances {
  /** Native MATIC/POL in wei (for gas). */
  matic: bigint;
  /** pUSD (6 decimals) — usable trading collateral. */
  pusd: bigint;
  /** Bridged USDC.e (6 decimals) — wrap into pUSD to trade. */
  usdce: bigint;
  /** Native USDC (6 decimals). */
  usdcNative: bigint;
}

export async function getBalances(publicClient: PublicClient, address: Address): Promise<Balances> {
  const [matic, pusd, usdce, usdcNative] = await Promise.all([
    publicClient.getBalance({ address }),
    readErc20Balance(publicClient, PUSD, address),
    readErc20Balance(publicClient, USDC_E, address),
    readErc20Balance(publicClient, USDC_NATIVE, address),
  ]);
  return { matic, pusd, usdce, usdcNative };
}

/** Wait for a tx and throw if it reverted (viem doesn't throw on reverted receipts). */
async function waitOrThrow(publicClient: PublicClient, hash: Hash, label: string): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted (${label}): ${hash}`);
  }
}

function readErc20Balance(publicClient: PublicClient, token: Address, owner: Address) {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

/**
 * Wrap `amount` (6-decimal base units) of `asset` (USDC.e by default) into pUSD,
 * crediting the caller. Approves the onramp to pull the asset first if needed.
 * Returns the wrap tx hash, or `null` if `amount` is 0.
 */
export async function wrapToPusd(
  clients: Clients,
  amount: bigint,
  asset: Address = USDC_E,
): Promise<Hash | null> {
  if (amount <= 0n) return null;
  const { publicClient, walletClient, account, address } = clients;

  const allowance = await publicClient.readContract({
    address: asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address, COLLATERAL_ONRAMP],
  });
  if (allowance < amount) {
    const approveHash = await walletClient.writeContract({
      account,
      chain: polygon,
      address: asset,
      abi: erc20Abi,
      functionName: "approve",
      args: [COLLATERAL_ONRAMP, maxUint256],
    });
    await waitOrThrow(publicClient, approveHash, "approve onramp");
  }

  const wrapHash = await walletClient.writeContract({
    account,
    chain: polygon,
    address: COLLATERAL_ONRAMP,
    abi: onrampAbi,
    functionName: "wrap",
    args: [asset, address, amount],
  });
  await waitOrThrow(publicClient, wrapHash, "wrap");
  return wrapHash;
}

export interface ApprovalResult {
  spender: Address;
  /** "pusd" = ERC-20 allowance; "ctf" = ERC-1155 operator approval. */
  kind: "pusd" | "ctf";
  /** Tx hash, or `null` if the approval was already in place. */
  hash: Hash | null;
}

/**
 * Idempotently grant the V2 exchanges permission to move the trader's pUSD and
 * outcome shares. Skips any approval already set, so it's cheap to re-run.
 */
export async function ensureTradingApprovals(clients: Clients): Promise<ApprovalResult[]> {
  const { publicClient, walletClient, account, address } = clients;
  const results: ApprovalResult[] = [];

  for (const spender of SPENDERS) {
    const allowance = await publicClient.readContract({
      address: PUSD,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, spender],
    });
    if (allowance >= maxUint256 / 2n) {
      results.push({ spender, kind: "pusd", hash: null });
    } else {
      const hash = await walletClient.writeContract({
        account,
        chain: polygon,
        address: PUSD,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      });
      await waitOrThrow(publicClient, hash, `approve pUSD → ${spender}`);
      results.push({ spender, kind: "pusd", hash });
    }

    const approvedForAll = await publicClient.readContract({
      address: CONDITIONAL_TOKENS,
      abi: ctfAbi,
      functionName: "isApprovedForAll",
      args: [address, spender],
    });
    if (approvedForAll) {
      results.push({ spender, kind: "ctf", hash: null });
    } else {
      const hash = await walletClient.writeContract({
        account,
        chain: polygon,
        address: CONDITIONAL_TOKENS,
        abi: ctfAbi,
        functionName: "setApprovalForAll",
        args: [spender, true],
      });
      await waitOrThrow(publicClient, hash, `CTF setApprovalForAll → ${spender}`);
      results.push({ spender, kind: "ctf", hash });
    }
  }

  return results;
}

/** Format a 6-decimal token amount as a human string (e.g. 1500000n → "1.5"). */
export function formatUnits6(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Parse a human USD string (e.g. "1.5") into 6-decimal base units. */
export function parseUnits6(value: string): bigint {
  const [whole, frac = ""] = value.trim().split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  return BigInt(whole || "0") * 1_000_000n + BigInt(fracPadded || "0");
}
