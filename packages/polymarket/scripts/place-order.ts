import { Side } from "@polymarket/clob-client-v2";
import { createClobClient, placeLimitOrder, placeMarketOrder, SignatureTypeV2 } from "../src/clob";
import { makeRelayClient } from "../src/deposit-wallet";
import { resolveFixture } from "../src/index";
import { parseArgs, privateKey, rpcUrl } from "./_env";

/**
 * Place a real order on Polymarket's CLOB.
 *
 * Pick the outcome either directly by token id or by resolving a fixture:
 *   place-order --token <id> --price 0.5 --size 2 --yes
 *   place-order --fixture "Brazil vs Morocco" --price 0.1 --size 10 --yes
 *   place-order --token <id> --market --amount 1 --yes        (FOK market buy)
 *
 * Without --yes it's a dry run: it resolves and prints the order but posts nothing.
 * Defaults to a tiny BUY so the first live order proves a fill safely.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const side = String(args.side ?? "buy").toUpperCase() === "SELL" ? Side.SELL : Side.BUY;
  const live = args.yes === true;

  // 1. Resolve the token id (directly or via fixture → blowout combo leg).
  let tokenID = typeof args.token === "string" ? args.token : undefined;
  if (!tokenID && typeof args.fixture === "string") {
    const resolution = await resolveFixture(args.fixture);
    console.log(`Event: ${resolution.event.title} (${resolution.event.slug})`);
    const comboIdx = Number(args.combo ?? 0);
    const legIdx = Number(args.leg ?? 0);
    const combo = resolution.combos[comboIdx];
    if (!combo) throw new Error(`No combo at index ${comboIdx} (have ${resolution.combos.length}).`);
    const leg = combo.legs[legIdx];
    if (!leg?.tokenId) throw new Error(`Leg ${legIdx} of combo "${combo.team}" has no CLOB token id.`);
    tokenID = leg.tokenId;
    console.log(
      `Combo: ${combo.team} blowout — leg "${leg.selection}" ` +
        `(p≈${(leg.probability * 100).toFixed(1)}%, tokenId ${tokenID})`,
    );
  }
  if (!tokenID) throw new Error("Provide --token <id> or --fixture <\"A vs B\">.");

  const isMarket = args.market === true || args.amount !== undefined;

  // 2. Connect. V2 requires the deposit-wallet flow — the EOA signs (POLY_1271)
  // but the maker/funder is the deposit wallet that holds the pUSD. Just derive
  // its address (unauthed); deployment/approvals are handled by `deposit-setup`.
  const { relay } = makeRelayClient(privateKey(), rpcUrl());
  const depositWallet = await relay.deriveDepositWalletAddress();
  const { client, address, funderAddress } = await createClobClient({
    privateKey: privateKey(),
    rpcUrl: rpcUrl(),
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: depositWallet,
  });
  console.log(`Signer ${address}, funder (deposit wallet) ${funderAddress}`);

  // 3. Show book context.
  const book = await client.getOrderBook(tokenID).catch(() => null);
  if (book) {
    const bestBid = book.bids?.at(-1)?.price;
    const bestAsk = book.asks?.at(-1)?.price;
    console.log(`Book: best bid ${bestBid ?? "—"}, best ask ${bestAsk ?? "—"}`);
  }

  if (isMarket) {
    const amount = Number(args.amount ?? 1);
    console.log(`${live ? "POSTING" : "[dry run]"} market ${side} ~$${amount} of ${tokenID}`);
    if (!live) return printDryRunHint();
    const res = await placeMarketOrder(client, { tokenID, amount, side });
    console.log("Response:", JSON.stringify(res, null, 2));
  } else {
    const price = Number(args.price);
    const size = Number(args.size ?? 1);
    if (!Number.isFinite(price)) throw new Error("Limit order needs --price <0..1>.");
    console.log(
      `${live ? "POSTING" : "[dry run]"} GTC ${side} ${size} @ ${price} ` +
        `(~$${(price * size).toFixed(2)}) of ${tokenID}`,
    );
    if (!live) return printDryRunHint();
    const res = await placeLimitOrder(client, { tokenID, price, size, side });
    console.log("Response:", JSON.stringify(res, null, 2));
  }
}

function printDryRunHint() {
  console.log("Dry run — re-run with --yes to post for real.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
