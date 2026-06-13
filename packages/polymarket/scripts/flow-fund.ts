import { config } from "dotenv";
import { resolve } from "node:path";
import { erc20Abi, maxUint256 } from "viem";
import { getClients, USDC_E, USDC_NATIVE } from "../src/onchain";
import { parseArgs, privateKey, rpcUrl } from "./_env";

/**
 * Headless Fireblocks Flow payment: settle USDC.e into the hedge wallet without
 * the browser checkout. Drives the same REST flow as `apps/web/lib/flow/server.ts`
 * (checkout → transaction → source → quote → prepare → sign → broadcast → poll),
 * but signs with the burner key directly.
 *
 * For the demo/self-test we use the burner as BOTH the Flow source and the
 * settlement destination — so it pays native USDC and receives USDC.e at the
 * same address (Flow acts as the swap). This is the cheap way to confirm Flow
 * can actually route to USDC.e before funding a real order.
 *
 *   pnpm --filter @fanguard/polymarket flow-fund -- --amount 0.05
 */

// Dynamic creds live in the web app's env; the burner key in this package's .env.
config({ path: resolve(import.meta.dirname, "../../../apps/web/.env") });
config({ path: resolve(import.meta.dirname, "../.env") });

const FLOW_API_BASE = "https://app.dynamicauth.com/api/v0";
const CHAIN_ID = "137";
const CHAIN_NAME = "EVM";
// Tokens come from the package: USDC_NATIVE is what we pay with, USDC_E what we settle into.

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Set it in apps/web/.env (Dynamic creds).`);
    process.exit(1);
  }
  return v;
}

async function flow<T>(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: unknown },
): Promise<T> {
  const res = await fetch(`${FLOW_API_BASE}${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json", ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    console.error(`[flow] ${init.method} ${path} → ${res.status}`, parsed ?? text);
    throw new Error(`Flow ${init.method} ${path} failed (${res.status})`);
  }
  return parsed as T;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const amount = String(args.amount ?? "0.05");
  const envId = reqEnv("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID");
  const apiToken = reqEnv("DYNAMIC_API_TOKEN");

  const { address, walletClient, publicClient, account } = getClients(privateKey(), rpcUrl());
  const auth = { Authorization: `Bearer ${apiToken}` };

  console.log(`Settling $${amount} USDC.e → ${address} (source = same wallet, paying native USDC)`);

  // 1. Checkout: settle USDC.e on Polygon → burner.
  const checkout = await flow<{ id: string }>(`/environments/${envId}/checkouts`, {
    method: "POST",
    headers: auth,
    body: {
      mode: "payment",
      settlementConfig: {
        strategy: "cheapest",
        settlements: [
          {
            chainName: CHAIN_NAME,
            chainId: CHAIN_ID,
            tokenAddress: USDC_E,
            symbol: "USDC.e",
            tokenDecimals: 6,
            isNative: false,
          },
        ],
      },
      destinationConfig: {
        destinations: [{ chainName: CHAIN_NAME, type: "address", identifier: address }],
      },
      enableOrchestration: true,
    },
  });
  console.log(`  checkout ${checkout.id}`);

  // 2. Transaction.
  const { sessionToken, transaction } = await flow<{
    sessionToken: string;
    transaction: { id: string };
  }>(`/sdk/${envId}/checkouts/${checkout.id}/transactions`, {
    method: "POST",
    body: { amount, currency: "USD" },
  });
  const sx = { "x-dynamic-checkout-session-token": sessionToken };
  console.log(`  transaction ${transaction.id}`);

  // 3. Attach the burner as the payment source.
  await flow(`/sdk/${envId}/transactions/${transaction.id}/source`, {
    method: "POST",
    headers: sx,
    body: { sourceType: "wallet", fromAddress: address, fromChainId: CHAIN_ID, fromChainName: CHAIN_NAME },
  });

  // 4. Quote: pay with native USDC.
  const quoted = await flow<{ quote?: { fromAmount?: string; toAmount?: string } }>(
    `/sdk/${envId}/transactions/${transaction.id}/quote`,
    { method: "POST", headers: sx, body: { fromTokenAddress: USDC_NATIVE } },
  );
  console.log(`  quote: pay ${quoted.quote?.fromAmount} → receive ${quoted.quote?.toAmount} USDC.e`);

  // 5. Prepare (retry while risk screening clears).
  let prepared: { quote?: { signingPayload?: SigningPayload } } | undefined;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      prepared = await flow(`/sdk/${envId}/transactions/${transaction.id}/prepare`, {
        method: "POST",
        headers: sx,
        body: { assertBalanceForGasCost: true, assertBalanceForTransferAmount: true },
      });
      break;
    } catch (err) {
      if (attempt === 7) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  const payload = prepared?.quote?.signingPayload;
  if (!payload?.evmTransaction) throw new Error("No EVM signing payload returned.");
  console.log("  signingPayload:", JSON.stringify(payload, null, 2));

  // 6. Sign + broadcast with the burner key.
  // The router (evmTransaction.to) transferFroms the source token from us, so it
  // is the real spender — Flow's evmApproval.spenderAddress is unreliable (it
  // comes back as the token address). Approve the token MAX to the router so the
  // pull (fromAmount + fees) always clears.
  if (payload.evmApproval) {
    const token = payload.evmApproval.tokenAddress as `0x${string}`;
    const spender = payload.evmTransaction.to as `0x${string}`;
    console.log(`  approving ${token} → router ${spender} (max)`);
    const approveHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, maxUint256],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }
  const txHash = await walletClient.sendTransaction({
    account,
    chain: walletClient.chain,
    to: payload.evmTransaction.to as `0x${string}`,
    data: payload.evmTransaction.data as `0x${string}`,
    value: BigInt(payload.evmTransaction.value || "0"),
  });
  console.log(`  broadcast ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // 7. Notify + poll settlement.
  await flow(`/sdk/${envId}/transactions/${transaction.id}/broadcast`, {
    method: "POST",
    headers: sx,
    body: { txHash },
  });
  for (let i = 0; i < 40; i++) {
    const tx = await flow<{ executionState: string; settlementState: string }>(
      `/sdk/${envId}/transactions/${transaction.id}`,
      { method: "GET" },
    );
    console.log(`  ${tx.executionState} / settlement: ${tx.settlementState}`);
    if (["completed", "failed"].includes(tx.settlementState)) break;
    if (["cancelled", "expired", "failed"].includes(tx.executionState)) break;
    await new Promise((r) => setTimeout(r, 3000));
  }

  const bal = await publicClient.readContract({
    address: USDC_E,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  console.log(`USDC.e balance now: ${Number(bal) / 1e6}`);
}

interface SigningPayload {
  chainId: string;
  evmTransaction: { to: string; data: string; value: string; gasLimit?: string };
  evmApproval?: { tokenAddress: string; spenderAddress: string; amount: string };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
