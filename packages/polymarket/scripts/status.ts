import { formatEther } from "viem";
import { getBalances, getClients, formatUnits6 } from "../src/onchain";
import { privateKey, rpcUrl } from "./_env";

/**
 * Print the trading wallet's address and balances, and whether it's ready to
 * place a real order. Run: `pnpm --filter @fanguard/polymarket status`.
 */
async function main() {
  const { address, publicClient } = getClients(privateKey(), rpcUrl());
  const b = await getBalances(publicClient, address);

  console.log(`Wallet:        ${address}`);
  console.log(`MATIC (gas):   ${formatEther(b.matic)}`);
  console.log(`pUSD:          ${formatUnits6(b.pusd)}`);
  console.log(`USDC.e:        ${formatUnits6(b.usdce)}`);
  console.log(`USDC (native): ${formatUnits6(b.usdcNative)}`);
  console.log("");

  const needs: string[] = [];
  if (b.matic === 0n) needs.push("MATIC for gas (~0.5 POL)");
  if (b.pusd === 0n) {
    if (b.usdce > 0n) needs.push("wrap USDC.e → pUSD (run `setup --wrap <amount>`)");
    else needs.push("pUSD collateral (send USDC.e, then wrap)");
  }

  if (needs.length === 0) {
    console.log("✅ Ready to trade. Run `setup` once for approvals, then `place-order`.");
  } else {
    console.log("⛔ Not ready. Still needs:");
    for (const n of needs) console.log(`   - ${n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
