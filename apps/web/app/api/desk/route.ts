import { NextResponse } from "next/server";
import { formatUnits, parseAbiItem } from "viem";

import { coverPoolAbi } from "~/lib/cover-pool/abi";
import {
  coverPoolAddress,
  COVERPOOL_COLLATERAL_DECIMALS,
  COVERPOOL_DEPLOY_BLOCK,
} from "~/lib/cover-pool/config";
import { deriveGameId } from "~/lib/cover-pool/game";
import { polygonPublicClient, settlerAccount, settlerWalletClient } from "~/lib/cover-pool/settler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Dublin, consistent with the other on-chain routes (see vercel.json).
export const preferredRegion = "dub1";

const GAME_OPENED = parseAbiItem(
  "event GameOpened(uint256 indexed gameId, uint256 threshold, uint256 exposureCap)",
);
const POLICY_BOUGHT = parseAbiItem(
  "event PolicyBought(uint256 indexed policyId, uint256 indexed gameId, address indexed holder, uint256 payout, uint256 premium)",
);

const usd = (raw: bigint) => Number(formatUnits(raw, COVERPOOL_COLLATERAL_DECIMALS));

/**
 * POST /api/desk — the FanGuard operator console backend.
 *   - "state":  vault metrics + games + policies (read on-chain).
 *   - "resolve": settler writes a game's final margin (gameId or matchup+team).
 *   - "claim":  settler pays a blowout policy to its holder.
 *
 * Settler-key actions run server-side (the key never reaches the browser).
 */
export async function POST(request: Request) {
  const address = coverPoolAddress();
  if (!address) {
    return NextResponse.json(
      {
        error: "CoverPool is not configured (NEXT_PUBLIC_COVERPOOL_ADDRESS).",
        code: "NOT_CONFIGURED",
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

  const publicClient = polygonPublicClient();

  try {
    switch (body.action) {
      case "state": {
        const [totalAssets, freeAssets, lockedExposure, totalShares, settler, owner] =
          await Promise.all([
            publicClient.readContract({ address, abi: coverPoolAbi, functionName: "totalAssets" }),
            publicClient.readContract({ address, abi: coverPoolAbi, functionName: "freeAssets" }),
            publicClient.readContract({
              address,
              abi: coverPoolAbi,
              functionName: "lockedExposure",
            }),
            publicClient.readContract({ address, abi: coverPoolAbi, functionName: "totalShares" }),
            publicClient.readContract({ address, abi: coverPoolAbi, functionName: "settler" }),
            publicClient.readContract({ address, abi: coverPoolAbi, functionName: "owner" }),
          ]);

        const [openedLogs, boughtLogs] = await Promise.all([
          publicClient.getLogs({
            address,
            event: GAME_OPENED,
            fromBlock: COVERPOOL_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address,
            event: POLICY_BOUGHT,
            fromBlock: COVERPOOL_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
        ]);

        // Current state per game (resolved/blowout/margin/totalPayout change after the open event).
        const gameIds = [...new Set(openedLogs.map((l) => l.args.gameId!))];
        const games = await Promise.all(
          gameIds.map(async (gameId) => {
            const g = await publicClient.readContract({
              address,
              abi: coverPoolAbi,
              functionName: "games",
              args: [gameId],
            });
            return {
              gameId: gameId.toString(),
              threshold: Number(g[3]),
              exposureCapUsd: usd(g[4]),
              totalPayoutUsd: usd(g[5]),
              resolved: g[1],
              blowout: g[2],
              margin: Number(g[6]),
            };
          }),
        );

        // Current claimed state per policy.
        const policies = await Promise.all(
          boughtLogs.map(async (l) => {
            const policyId = l.args.policyId!;
            const p = await publicClient.readContract({
              address,
              abi: coverPoolAbi,
              functionName: "policies",
              args: [policyId],
            });
            return {
              policyId: policyId.toString(),
              gameId: (l.args.gameId as bigint).toString(),
              holder: p[0] as string,
              payoutUsd: usd(p[2] as bigint),
              premiumUsd: usd(l.args.premium as bigint),
              claimed: p[3] as boolean,
            };
          }),
        );

        return NextResponse.json(
          {
            address,
            settler: settler as string,
            owner: owner as string,
            totalAssetsUsd: usd(totalAssets as bigint),
            freeAssetsUsd: usd(freeAssets as bigint),
            lockedExposureUsd: usd(lockedExposure as bigint),
            totalShares: (totalShares as bigint).toString(),
            games: games.sort((a, b) => Number(a.resolved) - Number(b.resolved)),
            policies,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      case "resolve": {
        const account = settlerAccount();
        if (!account) return notConfiguredSettler();
        const gameId = resolveGameId(body);
        if (gameId == null) return bad("`gameId` (or `matchup` + `team`) is required.");
        const marginRaw = body.margin;
        const margin = typeof marginRaw === "number" ? marginRaw : Number(marginRaw);
        if (!Number.isInteger(margin) || margin < 0) {
          return bad("`margin` must be a non-negative integer (goals/points the team lost by).");
        }
        const wallet = settlerWalletClient(account);
        const hash = await wallet.writeContract({
          address,
          abi: coverPoolAbi,
          functionName: "resolve",
          args: [gameId, BigInt(margin)],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        return NextResponse.json({ ok: true, txHash: hash, gameId: gameId.toString(), margin });
      }

      case "claim": {
        const account = settlerAccount();
        if (!account) return notConfiguredSettler();
        const policyIdRaw = body.policyId;
        if (policyIdRaw == null || !/^\d+$/.test(String(policyIdRaw))) {
          return bad("`policyId` must be a positive integer.");
        }
        const policyId = BigInt(String(policyIdRaw));
        const wallet = settlerWalletClient(account);
        const hash = await wallet.writeContract({
          address,
          abi: coverPoolAbi,
          functionName: "claim",
          args: [policyId],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        return NextResponse.json({ ok: true, txHash: hash, policyId: policyId.toString() });
      }

      default:
        return bad(`Unknown action: ${String(body.action)}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Desk request failed.";
    console.error("[/api/desk] error", error);
    return NextResponse.json({ error: message, code: "DESK_ERROR" }, { status: 502 });
  }
}

/** A resolve/claim call needs the settler key — surface a clear 501 when absent. */
function notConfiguredSettler() {
  return NextResponse.json(
    {
      error: "Settler key not configured (SETTLER_PRIVATE_KEY) — read-only Desk.",
      code: "NO_SETTLER",
    },
    { status: 501 },
  );
}

/** Resolve a gameId from an explicit value or a matchup+team pair. */
function resolveGameId(body: Record<string, unknown>): bigint | null {
  const raw = body.gameId;
  if (raw != null && /^\d+$/.test(String(raw))) return BigInt(String(raw));
  const matchup = typeof body.matchup === "string" ? body.matchup.trim() : "";
  const team = typeof body.team === "string" ? body.team.trim() : "";
  if (matchup && team) return deriveGameId(matchup, team);
  return null;
}

function bad(message: string) {
  return NextResponse.json({ error: message, code: "BAD_REQUEST" }, { status: 400 });
}
