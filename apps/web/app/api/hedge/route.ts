import { NextResponse } from "next/server";

import {
  getHedgeStatus,
  HedgeNotConfiguredError,
  placeHedge,
  previewHedge,
} from "~/lib/hedge/service";

// Node runtime (ethers/axios SDKs) + never cached — this places real orders.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/hedge — the FanGuard hedge desk (server-side).
 *   - "status": deposit wallet address + pUSD buying power.
 *   - "place":  resolve the blowout combo and place the offsetting Polymarket order.
 *
 * Keeps the trading key off the client and runs from the server's region (the
 * CLOB order endpoint is geofenced).
 */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    switch (payload.action) {
      case "status": {
        return NextResponse.json(await getHedgeStatus());
      }
      case "preview": {
        const matchup = asString(payload.matchup);
        const myTeam = asString(payload.team);
        if (!matchup || !myTeam) {
          return badRequest("`matchup` and `team` are required for `preview`.");
        }
        const preview = await previewHedge({
          matchup,
          myTeam,
          shutout: payload.shutout === true || payload.shutout === "1",
          coverageUsd: typeof payload.coverageUsd === "number" ? payload.coverageUsd : undefined,
        });
        return NextResponse.json(preview);
      }
      case "place": {
        const matchup = asString(payload.matchup);
        const myTeam = asString(payload.team);
        if (!matchup || !myTeam) {
          return badRequest("`matchup` and `team` are required for `place`.");
        }
        const result = await placeHedge({
          matchup,
          myTeam,
          shutout: payload.shutout === true || payload.shutout === "1",
          notionalUsd: typeof payload.notionalUsd === "number" ? payload.notionalUsd : undefined,
          coverageUsd: typeof payload.coverageUsd === "number" ? payload.coverageUsd : undefined,
        });
        return NextResponse.json(result);
      }
      default:
        return badRequest(`Unknown action: ${String(payload.action)}`);
    }
  } catch (error) {
    if (error instanceof HedgeNotConfiguredError) {
      return NextResponse.json(
        { error: error.message, code: "HEDGE_NOT_CONFIGURED" },
        { status: 501 },
      );
    }
    const message = error instanceof Error ? error.message : "Unexpected hedge error.";
    console.error("[/api/hedge] error", error);
    return NextResponse.json({ error: message, code: "HEDGE_ERROR" }, { status: 502 });
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function badRequest(message: string) {
  return NextResponse.json({ error: message, code: "BAD_REQUEST" }, { status: 400 });
}
