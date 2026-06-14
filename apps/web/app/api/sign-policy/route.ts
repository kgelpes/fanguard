import { NextResponse } from "next/server";
import { getAddress, isAddress, parseUnits } from "viem";

import { coverPoolAbi } from "~/lib/cover-pool/abi";
import { coverPoolAddress, COVERPOOL_CHAIN_ID } from "~/lib/cover-pool/config";
import { deriveGameId, DEFAULT_BLOWOUT_THRESHOLD } from "~/lib/cover-pool/game";
import { polygonPublicClient, settlerAccount, settlerWalletClient } from "~/lib/cover-pool/settler";
import { USDC_DECIMALS } from "~/lib/flow/config";

// viem clients (ethers-free) run fine on Edge, but keep Node for parity with the
// other on-chain routes. Never cached — it reads a live nonce and opens games.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Dublin, consistent with the other checkout routes (see vercel.json).
export const preferredRegion = "dub1";

// How much total payout a single game may back. Roomy so many fans can cover the
// same game; the on-chain solvency check still gates against real collateral.
const EXPOSURE_CAP_MULTIPLE = 100n;
// A signed quote is short-lived — the fan mints right after paying.
const QUOTE_TTL_SECONDS = 30 * 60;

/**
 * POST /api/sign-policy — the CoverPool settler.
 *
 * Given a buyer + the cover economics, it (1) opens the game on-chain if needed,
 * (2) reads the buyer's nonce, and (3) signs the EIP-712 `BuyPolicy` quote the
 * fan's wallet submits to `buyPolicy`. The settler key never leaves the server.
 *
 * Demo scope: the settler trusts the client's payout/premium (the same operator
 * runs both, and the contract still enforces solvency, the exposure cap, the
 * nonce, and the deadline). Production should re-derive the economics here.
 */
export async function POST(request: Request) {
  const address = coverPoolAddress();
  const account = settlerAccount();
  if (!address || !account) {
    return NextResponse.json(
      {
        error:
          "CoverPool is not configured. Set NEXT_PUBLIC_COVERPOOL_ADDRESS and SETTLER_PRIVATE_KEY (its address must equal the deployed pool's settler).",
        code: "COVERPOOL_NOT_CONFIGURED",
      },
      { status: 501 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const buyerRaw = asString(body.buyer);
  const matchup = asString(body.matchup);
  const team = asString(body.team);
  const payoutUsd = asNumber(body.payoutUsd);
  const premiumUsd = asNumber(body.premiumUsd);
  const thresholdInput = asNumber(body.threshold);

  if (!isAddress(buyerRaw)) return bad("`buyer` must be a valid EVM address.");
  if (!matchup || !team) return bad("`matchup` and `team` are required.");
  if (payoutUsd == null || payoutUsd <= 0) return bad("`payoutUsd` must be a positive number.");
  if (premiumUsd == null || premiumUsd <= 0) return bad("`premiumUsd` must be a positive number.");

  const buyer = getAddress(buyerRaw);
  const gameId = deriveGameId(matchup, team);
  const payout = parseUnits(payoutUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS);
  const premium = parseUnits(premiumUsd.toFixed(USDC_DECIMALS), USDC_DECIMALS);
  const threshold = BigInt(
    thresholdInput && thresholdInput > 0 ? Math.floor(thresholdInput) : DEFAULT_BLOWOUT_THRESHOLD,
  );

  const publicClient = polygonPublicClient();

  try {
    // 1. Open the game on-chain if this is the first policy for it.
    const game = await publicClient.readContract({
      address,
      abi: coverPoolAbi,
      functionName: "games",
      args: [gameId],
    });
    const opened = game[0];
    const resolved = game[1];
    // A resolved game is final — buyPolicy would revert GameResolvedAlready.
    // gameId is deterministic from (matchup, team), so once a game is resolved
    // that match+team can't take new cover. Fail clearly here instead of letting
    // the fan sign a tx that's guaranteed to revert (and burn gas).
    if (opened && resolved) {
      return NextResponse.json(
        {
          error:
            "This match is already settled, so cover for it is closed. Pick a different match or team to insure.",
          code: "GAME_RESOLVED",
        },
        { status: 409 },
      );
    }
    if (!opened) {
      const wallet = settlerWalletClient(account);
      try {
        const hash = await wallet.writeContract({
          address,
          abi: coverPoolAbi,
          functionName: "openGame",
          args: [gameId, threshold, payout * EXPOSURE_CAP_MULTIPLE],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      } catch (openError) {
        // Tolerate a race (another request opened it first): re-read and proceed
        // only if it's now open; otherwise the failure is real (e.g. NotSettler).
        const recheck = await publicClient.readContract({
          address,
          abi: coverPoolAbi,
          functionName: "games",
          args: [gameId],
        });
        if (!recheck[0]) throw openError;
      }
    }

    // 2. Read the buyer's current nonce (consumed in order by buyPolicy).
    const nonce = await publicClient.readContract({
      address,
      abi: coverPoolAbi,
      functionName: "nonces",
      args: [buyer],
    });

    // The vault's collateral is immutable — read it from the contract so the
    // client approves exactly what buyPolicy will pull, regardless of which
    // token the pool was deployed with (native USDC now, USDC.e before). This
    // is the single source of truth; nothing else hardcodes the token.
    const collateral = await publicClient.readContract({
      address,
      abi: coverPoolAbi,
      functionName: "collateral",
    });

    // 3. Sign the EIP-712 BuyPolicy quote. Domain must match CoverPool.sol exactly.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS);
    const signature = await account.signTypedData({
      domain: {
        name: "FanGuard CoverPool",
        version: "1",
        chainId: COVERPOOL_CHAIN_ID,
        verifyingContract: address,
      },
      types: {
        BuyPolicy: [
          { name: "buyer", type: "address" },
          { name: "gameId", type: "uint256" },
          { name: "payout", type: "uint256" },
          { name: "premium", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "BuyPolicy",
      message: { buyer, gameId, payout, premium, nonce, deadline },
    });

    return NextResponse.json(
      {
        coverPoolAddress: address,
        collateral: getAddress(collateral),
        gameId: gameId.toString(),
        payout: payout.toString(),
        premium: premium.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        threshold: Number(threshold),
        signature,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sign the policy quote.";
    console.error("[/api/sign-policy] error", error);
    return NextResponse.json({ error: message, code: "SIGN_POLICY_ERROR" }, { status: 502 });
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bad(message: string) {
  return NextResponse.json({ error: message, code: "BAD_REQUEST" }, { status: 400 });
}
