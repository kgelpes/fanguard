import { AssetType } from "@polymarket/clob-client-v2";
import { createClobClient } from "../src/clob";
import {
  ensureTradingApprovals,
  getBalances,
  getClients,
  parseUnits6,
  formatUnits6,
  wrapToPusd,
  USDC_E,
  USDC_NATIVE,
} from "../src/onchain";
import { parseArgs, privateKey, rpcUrl } from "./_env";

/**
 * One-time (idempotent) trading setup for the wallet in .env:
 *   1. optionally wrap USDC.e → pUSD     (`--wrap <usd>`, `--asset native` for native USDC)
 *   2. approve pUSD + CTF to the V2 exchanges
 *   3. tell the CLOB API to re-sync balances/allowances
 *
 * Run: `pnpm --filter @fanguard/polymarket setup --wrap 5`
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const clients = getClients(privateKey(), rpcUrl());
  const { address, publicClient } = clients;

  console.log(`Wallet: ${address}`);
  let b = await getBalances(publicClient, address);
  console.log(`Before — pUSD ${formatUnits6(b.pusd)}, USDC.e ${formatUnits6(b.usdce)}`);

  if (args.wrap) {
    const amount = parseUnits6(String(args.wrap));
    const asset = args.asset === "native" ? USDC_NATIVE : USDC_E;
    console.log(`Wrapping ${formatUnits6(amount)} (${asset}) → pUSD…`);
    const hash = await wrapToPusd(clients, amount, asset);
    console.log(`  wrap tx: ${hash}`);
  }

  console.log("Ensuring trading approvals (pUSD + CTF → V2 exchanges)…");
  const results = await ensureTradingApprovals(clients);
  for (const r of results) {
    console.log(`  ${r.kind.padEnd(4)} → ${r.spender}: ${r.hash ?? "already set"}`);
  }

  console.log("Syncing CLOB balance/allowance…");
  const { client } = await createClobClient({ privateKey: privateKey(), rpcUrl: rpcUrl() });
  await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });

  b = await getBalances(publicClient, address);
  console.log(`After — pUSD ${formatUnits6(b.pusd)}, USDC.e ${formatUnits6(b.usdce)}`);
  console.log("✅ Setup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
