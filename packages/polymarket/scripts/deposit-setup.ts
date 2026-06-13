import { AssetType } from "@polymarket/clob-client-v2";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { erc20Abi } from "viem";
import { createClobClient, SignatureTypeV2 } from "../src/clob";
import { approveDepositWallet, ensureDepositWallet, makeRelayClient } from "../src/deposit-wallet";
import { formatUnits6, getClients, parseUnits6, PUSD } from "../src/onchain";
import { parseArgs, privateKey, rpcUrl } from "./_env";

/**
 * One-time deposit-wallet setup for V2 CLOB trading:
 *   1. mint a builder API key (authorizes the relayer)
 *   2. derive + deploy the deposit wallet (gasless, via relayer)
 *   3. move pUSD from the EOA into the deposit wallet (its CLOB buying power)
 *   4. approve pUSD + CTF to the V2 exchanges (gasless relayer batch)
 *   5. sync the CLOB's balance/allowance view (POLY_1271)
 *
 * Run: `pnpm --filter @fanguard/polymarket run deposit-setup -- --fund 1.9`
 * `--fund` is the pUSD amount to move in; omit to move the EOA's full balance.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pk = privateKey();
  const { address, publicClient, walletClient, account } = getClients(pk, rpcUrl());

  // 1. Builder key → relayer auth.
  const bootstrap = await createClobClient({ privateKey: pk, rpcUrl: rpcUrl() });
  const builderCreds = await bootstrap.client.createBuilderApiKey();
  const builderConfig = new BuilderConfig({ localBuilderCreds: builderCreds });

  // 2. Derive + deploy the deposit wallet.
  const { relay } = makeRelayClient(pk, rpcUrl(), builderConfig);
  console.log(`EOA: ${address}`);
  const { address: depositWallet, justDeployed } = await ensureDepositWallet(relay);
  console.log(`Deposit wallet: ${depositWallet} (${justDeployed ? "deployed now" : "already deployed"})`);

  // 3. Move pUSD EOA → deposit wallet (deposit-wallet pUSD is the buying power).
  const eoaPusd = (await publicClient.readContract({
    address: PUSD,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  })) as bigint;
  const requested = args.fund ? parseUnits6(String(args.fund)) : eoaPusd;
  const amount = requested > eoaPusd ? eoaPusd : requested;
  if (amount > 0n) {
    console.log(`Transferring ${formatUnits6(amount)} pUSD → deposit wallet…`);
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: PUSD,
      abi: erc20Abi,
      functionName: "transfer",
      args: [depositWallet, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  transfer tx: ${hash}`);
  }

  // 4. Approvals from the deposit wallet (relayer batch).
  console.log("Approving pUSD + CTF → V2 exchanges (relayer batch)…");
  await approveDepositWallet(relay, depositWallet);

  // 5. Sync the CLOB's view.
  console.log("Syncing CLOB balance/allowance (POLY_1271)…");
  const trading = await createClobClient({
    privateKey: pk,
    rpcUrl: rpcUrl(),
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: depositWallet,
  });
  await trading.client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });

  const dwPusd = (await publicClient.readContract({
    address: PUSD,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [depositWallet],
  })) as bigint;
  console.log(`Deposit wallet pUSD: ${formatUnits6(dwPusd)}`);
  console.log(`✅ Deposit wallet ready. place-order will use funder=${depositWallet}, POLY_1271.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
